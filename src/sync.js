const fs = require("fs");
const path = require("path");

const { getCalendar } = require("./googleCalendar");

const TIMEZONE = process.env.TIMEZONE || "Europe/Moscow";

const EVENTS_PATH = path.join(
    process.cwd(),
    "data",
    "events.json"
);

const HOMEWORK_MARKER = "📝 ДЗ:";
const CANCELLED_MARKER = "❌ ОТМЕНЕНО";


// ============================================================
// STORAGE
// ============================================================

function ensureDataDirectory() {
    const dir = path.dirname(EVENTS_PATH);

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function loadSavedEvents() {
    ensureDataDirectory();

    if (!fs.existsSync(EVENTS_PATH)) {
        return {};
    }

    try {
        const data = fs.readFileSync(
            EVENTS_PATH,
            "utf8"
        );

        if (!data.trim()) {
            return {};
        }

        return JSON.parse(data);
    } catch (error) {
        console.error(
            "❌ Ошибка чтения data/events.json:",
            error.message
        );

        return {};
    }
}

function saveSavedEvents(events) {
    ensureDataDirectory();

    const tempPath = `${EVENTS_PATH}.tmp`;

    fs.writeFileSync(
        tempPath,
        JSON.stringify(events, null, 2),
        "utf8"
    );

    fs.renameSync(
        tempPath,
        EVENTS_PATH
    );
}


// ============================================================
// DATE / TIME
// ============================================================

function getTodayISO() {
    const formatter = new Intl.DateTimeFormat(
        "en-CA",
        {
            timeZone: TIMEZONE,
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }
    );

    return formatter.format(new Date());
}

function getDateTimeParts(dateTime) {
    if (!dateTime) {
        return {
            date: null,
            time: null
        };
    }

    const date = new Date(dateTime);

    if (Number.isNaN(date.getTime())) {
        return {
            date: null,
            time: null
        };
    }

    const formatter = new Intl.DateTimeFormat(
        "en-CA",
        {
            timeZone: TIMEZONE,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        }
    );

    const parts = formatter.formatToParts(date);

    const result = {};

    for (const part of parts) {
        if (part.type !== "literal") {
            result[part.type] = part.value;
        }
    }

    let hour = result.hour;

    if (hour === "24") {
        hour = "00";
    }

    return {
        date:
            `${result.year}-${result.month}-${result.day}`,

        time:
            `${hour}:${result.minute}`
    };
}

function isPastDate(date) {
    if (!date) {
        return false;
    }

    return date < getTodayISO();
}

function isPastLesson(lesson) {
    return isPastDate(lesson.date);
}


// ============================================================
// EVENT KEY / FINGERPRINT
// ============================================================

function getEventKey(lesson) {
    return `lesson_${lesson.lessonId}`;
}

function createFingerprint(lesson) {
    return JSON.stringify({
        lessonId: lesson.lessonId || null,
        subject: lesson.subject || null,
        teacher: lesson.teacher || null,
        type: lesson.type || null,
        room: lesson.room || null,
        building: lesson.building || null,
        stream: lesson.stream || null,
        startDateTime:
            lesson.startDateTime || null,
        endDateTime:
            lesson.endDateTime || null
    });
}


// ============================================================
// HOMEWORK
// ============================================================

function extractHomework(description) {
    if (!description) {
        return "";
    }

    const index =
        description.indexOf(
            HOMEWORK_MARKER
        );

    if (index === -1) {
        return "";
    }

    return description
        .slice(
            index + HOMEWORK_MARKER.length
        )
        .trim();
}

function buildDescription(
    lesson,
    homework = "",
    cancelled = false
) {
    const lines = [];

    if (cancelled) {
        lines.push(CANCELLED_MARKER);
        lines.push("");
    }

    lines.push(
        `📚 Предмет: ${lesson.subject || "—"}`
    );

    if (lesson.teacher) {
        lines.push(
            `👨‍🏫 Преподаватель: ${lesson.teacher}`
        );
    }

    if (lesson.type) {
        lines.push(
            `📖 Тип: ${lesson.type}`
        );
    }

    if (lesson.room) {
        lines.push(
            `🚪 Аудитория: ${lesson.room}`
        );
    }

    if (lesson.building) {
        lines.push(
            `🏢 Корпус: ${lesson.building}`
        );
    }

    if (lesson.stream) {
        lines.push(
            `👥 Поток: ${lesson.stream}`
        );
    }

    lines.push("");
    lines.push("🏫 Финансовый университет");
    lines.push(
        `🆔 ID занятия: ${lesson.lessonId}`
    );

    lines.push("");
    lines.push(HOMEWORK_MARKER);
    lines.push("");

    if (homework) {
        lines.push(homework);
    }

    return lines.join("\n");
}

function buildGoogleEvent(
    lesson,
    homework = ""
) {
    return {
        summary:
            lesson.subject || "Занятие",

        description:
            buildDescription(
                lesson,
                homework
            ),

        start: {
            dateTime:
                lesson.startDateTime,

            timeZone:
                TIMEZONE
        },

        end: {
            dateTime:
                lesson.endDateTime,

            timeZone:
                TIMEZONE
        }
    };
}


// ============================================================
// GOOGLE
// ============================================================

async function getGoogleEvent(
    calendar,
    eventId
) {
    if (!eventId) {
        return null;
    }

    try {
        const response =
            await calendar.events.get({
                calendarId:
                    process.env.GOOGLE_CALENDAR_ID,

                eventId
            });

        return response.data;
    } catch (error) {
        if (
            error.code === 404 ||
            error.response?.status === 404
        ) {
            return null;
        }

        throw error;
    }
}

async function createGoogleEvent(
    calendar,
    lesson,
    homework = ""
) {
    const response =
        await calendar.events.insert({
            calendarId:
                process.env.GOOGLE_CALENDAR_ID,

            requestBody:
                buildGoogleEvent(
                    lesson,
                    homework
                )
        });

    return response.data;
}

async function updateGoogleEvent(
    calendar,
    eventId,
    eventData
) {
    return calendar.events.update({
        calendarId:
            process.env.GOOGLE_CALENDAR_ID,

        eventId,

        requestBody:
            eventData
    });
}


// ============================================================
// SAVED EVENT
// ============================================================

function buildSavedEvent(
    lesson,
    googleEventId,
    fingerprint,
    extra = {}
) {
    return {
        googleEventId,

        lessonId:
            lesson.lessonId,

        date:
            lesson.date || null,

        timeStart:
            lesson.timeStart || null,

        timeEnd:
            lesson.timeEnd || null,

        startDateTime:
            lesson.startDateTime || null,

        endDateTime:
            lesson.endDateTime || null,

        subject:
            lesson.subject || null,

        teacher:
            lesson.teacher || null,

        type:
            lesson.type || null,

        room:
            lesson.room || null,

        building:
            lesson.building || null,

        stream:
            lesson.stream || null,

        fingerprint,

        cancelled:
            extra.cancelled || false,

        transferredToKey:
            Object.prototype.hasOwnProperty.call(
                extra,
                "transferredToKey"
            )
                ? extra.transferredToKey
                : null,

        migrationStatus:
            extra.migrationStatus ||
            null,

        lastSync:
            new Date().toISOString()
    };
}


// ============================================================
// MIGRATION
// ============================================================

function getTeacherFromDescription(
    description
) {
    const match =
        description?.match(
            /👨‍🏫 Преподаватель:\s*(.+)/
        );

    return match
        ? match[1].trim()
        : null;
}

function getTypeFromDescription(
    description
) {
    const match =
        description?.match(
            /📖 Тип:\s*(.+)/
        );

    return match
        ? match[1].trim()
        : null;
}

function getRoomFromDescription(
    description
) {
    const match =
        description?.match(
            /🚪 Аудитория:\s*(.+)/
        );

    return match
        ? match[1].trim()
        : null;
}

function getBuildingFromDescription(
    description
) {
    const match =
        description?.match(
            /🏢 Корпус:\s*(.+)/
        );

    return match
        ? match[1].trim()
        : null;
}

function getStreamFromDescription(
    description
) {
    const match =
        description?.match(
            /👥 Поток:\s*(.+)/
        );

    return match
        ? match[1].trim()
        : null;
}

async function migrateOldEvents(
    calendar,
    savedEvents
) {
    const oldEvents =
        Object.entries(savedEvents)
            .filter(
                ([, event]) =>
                    event &&
                    event.googleEventId &&
                    !event.date
            );

    if (oldEvents.length === 0) {
        console.log(
            "✅ Старых записей для миграции нет"
        );

        return 0;
    }

    console.log("");
    console.log(
        `🔧 Найдено старых записей для миграции: ${oldEvents.length}`
    );

    let migrated = 0;

    for (
        const [key, saved]
        of oldEvents
    ) {
        try {
            console.log(
                `🔄 Миграция: ${key}`
            );

            const googleEvent =
                await getGoogleEvent(
                    calendar,
                    saved.googleEventId
                );

            if (!googleEvent) {
                console.log(
                    `⚠️ Google-событие не найдено: ${saved.googleEventId}`
                );

                saved.migrationStatus =
                    "google_event_not_found";

                saved.lastSync =
                    new Date().toISOString();

                continue;
            }

            const start =
                getDateTimeParts(
                    googleEvent.start?.dateTime
                );

            const end =
                getDateTimeParts(
                    googleEvent.end?.dateTime
                );

            const description =
                googleEvent.description || "";

            const subject =
                saved.subject ||
                (googleEvent.summary || "")
                    .replace(
                        `${CANCELLED_MARKER} `,
                        ""
                    )
                    .trim();

            saved.date =
                start.date;

            saved.timeStart =
                start.time;

            saved.timeEnd =
                end.time;

            saved.startDateTime =
                googleEvent.start?.dateTime ||
                null;

            saved.endDateTime =
                googleEvent.end?.dateTime ||
                null;

            saved.subject =
                subject || null;

            saved.teacher =
                saved.teacher ||
                getTeacherFromDescription(
                    description
                );

            saved.type =
                saved.type ||
                getTypeFromDescription(
                    description
                );

            saved.room =
                saved.room ||
                getRoomFromDescription(
                    description
                );

            saved.building =
                saved.building ||
                getBuildingFromDescription(
                    description
                );

            saved.stream =
                saved.stream ||
                getStreamFromDescription(
                    description
                );

            saved.cancelled =
                description.includes(
                    CANCELLED_MARKER
                );

            saved.migrationStatus =
                "migrated";

            saved.lastSync =
                new Date().toISOString();

            migrated++;

            console.log(
                `   ✅ ${subject || "Без названия"} — ${start.date} ${start.time}`
            );
        } catch (error) {
            console.error(
                `   ❌ Ошибка миграции ${key}:`,
                error.message
            );
        }
    }

    saveSavedEvents(savedEvents);

    console.log(
        `🔧 Миграция завершена: ${migrated}/${oldEvents.length}`
    );

    return migrated;
}


// ============================================================
// NEXT LESSON
// ============================================================

function getLessonTimestamp(
    lesson
) {
    if (!lesson) {
        return Number.MAX_SAFE_INTEGER;
    }

    if (lesson.startDateTime) {
        const timestamp =
            new Date(
                lesson.startDateTime
            ).getTime();

        if (!Number.isNaN(timestamp)) {
            return timestamp;
        }
    }

    if (
        lesson.date &&
        lesson.timeStart
    ) {
        const timestamp =
            new Date(
                `${lesson.date}T${lesson.timeStart}:00`
            ).getTime();

        if (!Number.isNaN(timestamp)) {
            return timestamp;
        }
    }

    return Number.MAX_SAFE_INTEGER;
}

function findNextLesson(
    lessons,
    savedEvent
) {
    if (
        !savedEvent ||
        !savedEvent.subject
    ) {
        return null;
    }

    const sourceTimestamp =
        getLessonTimestamp(
            savedEvent
        );

    return lessons
        .filter(lesson => {
            if (
                !lesson ||
                lesson.subject !==
                    savedEvent.subject
            ) {
                return false;
            }

            return (
                getLessonTimestamp(
                    lesson
                ) > sourceTimestamp
            );
        })
        .sort(
            (a, b) =>
                getLessonTimestamp(a) -
                getLessonTimestamp(b)
        )[0] || null;
}


// ============================================================
// CANCEL
// ============================================================

async function cancelGoogleEvent(
    calendar,
    googleEvent
) {
    if (!googleEvent) {
        return false;
    }

    let summary =
        googleEvent.summary ||
        "Занятие";

    if (
        !summary.startsWith(
            CANCELLED_MARKER
        )
    ) {
        summary =
            `${CANCELLED_MARKER} ${summary}`;
    }

    let description =
        googleEvent.description || "";

    if (
        !description.includes(
            CANCELLED_MARKER
        )
    ) {
        description =
            `${CANCELLED_MARKER}\n\n${description}`;
    }

    await updateGoogleEvent(
        calendar,
        googleEvent.id,
        {
            summary,
            description,

            start:
                googleEvent.start,

            end:
                googleEvent.end,

            location:
                googleEvent.location
        }
    );

    return true;
}


// ============================================================
// HOMEWORK TRANSFER
// ============================================================

async function transferHomework(
    calendar,
    oldGoogleEvent,
    nextSaved,
    nextLesson
) {
    const homework =
        extractHomework(
            oldGoogleEvent.description
        );

    if (!homework) {
        return false;
    }

    if (
        !nextSaved ||
        !nextSaved.googleEventId
    ) {
        return false;
    }

    const nextGoogleEvent =
        await getGoogleEvent(
            calendar,
            nextSaved.googleEventId
        );

    if (!nextGoogleEvent) {
        return false;
    }

    const existingHomework =
        extractHomework(
            nextGoogleEvent.description
        );

    let mergedHomework =
        existingHomework;

    if (!mergedHomework) {
        mergedHomework = homework;
    } else if (
        !mergedHomework.includes(
            homework
        )
    ) {
        mergedHomework =
            `${mergedHomework}\n${homework}`;
    }

    await updateGoogleEvent(
        calendar,
        nextGoogleEvent.id,
        {
            ...nextGoogleEvent,

            summary:
                nextLesson.subject,

            description:
                buildDescription(
                    nextLesson,
                    mergedHomework
                )
        }
    );

    return true;
}


// ============================================================
// SYNC
// ============================================================

async function syncSchedule(lessons) {
    console.log("");
    console.log(
        "🔄 Начинаем сравнение расписания..."
    );

    console.log(
        `📅 Сегодня: ${getTodayISO()}`
    );

    const calendar =
        getCalendar();

    const savedEvents =
        loadSavedEvents();

    // --------------------------------------------------------
    // MIGRATION
    // --------------------------------------------------------

    await migrateOldEvents(
        calendar,
        savedEvents
    );

    // --------------------------------------------------------
    // CURRENT LESSONS
    // --------------------------------------------------------

    const currentKeys =
        new Set(
            lessons.map(
                getEventKey
            )
        );

    const newEvents = {
        ...savedEvents
    };

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let cancelled = 0;
    let homeworkTransferred = 0;
    let errors = 0;

    // --------------------------------------------------------
    // PROCESS CURRENT SCHEDULE
    // --------------------------------------------------------

    for (const lesson of lessons) {
        const key =
            getEventKey(lesson);

        const fingerprint =
            createFingerprint(
                lesson
            );

        const saved =
            savedEvents[key];

        try {
            // NEW
            if (!saved) {
                const googleEvent =
                    await createGoogleEvent(
                        calendar,
                        lesson
                    );

                newEvents[key] =
                    buildSavedEvent(
                        lesson,
                        googleEvent.id,
                        fingerprint
                    );

                created++;

                console.log(
                    `➕ Создано: ${lesson.subject}`
                );

                continue;
            }

            // PAST
            if (
                isPastLesson(
                    lesson
                )
            ) {
                newEvents[key] = {
                    ...saved,

                    date:
                        lesson.date,

                    timeStart:
                        lesson.timeStart,

                    timeEnd:
                        lesson.timeEnd,

                    startDateTime:
                        lesson.startDateTime,

                    endDateTime:
                        lesson.endDateTime,

                    subject:
                        lesson.subject,

                    teacher:
                        lesson.teacher,

                    type:
                        lesson.type,

                    room:
                        lesson.room,

                    building:
                        lesson.building,

                    stream:
                        lesson.stream
                };

                skipped++;

                console.log(
                    `⏭️ Прошедшее занятие: ${lesson.subject}`
                );

                continue;
            }

            // UNCHANGED
            if (
                saved.fingerprint ===
                fingerprint
            ) {
                newEvents[key] = {
                    ...saved,

                    date:
                        lesson.date,

                    timeStart:
                        lesson.timeStart,

                    timeEnd:
                        lesson.timeEnd,

                    startDateTime:
                        lesson.startDateTime,

                    endDateTime:
                        lesson.endDateTime,

                    subject:
                        lesson.subject,

                    teacher:
                        lesson.teacher,

                    type:
                        lesson.type,

                    room:
                        lesson.room,

                    building:
                        lesson.building,

                    stream:
                        lesson.stream,

                    cancelled: false,

                    transferredToKey: null,

                    migrationStatus:
                        saved.migrationStatus ||
                        null,

                    lastSync:
                        new Date().toISOString()
                };

                skipped++;

                console.log(
                    `⏭️ Без изменений: ${lesson.subject}`
                );

                continue;
            }

            // CHANGED
            const googleEvent =
                await getGoogleEvent(
                    calendar,
                    saved.googleEventId
                );

            if (googleEvent) {
                const homework =
                    extractHomework(
                        googleEvent.description
                    );

                await updateGoogleEvent(
                    calendar,
                    saved.googleEventId,
                    buildGoogleEvent(
                        lesson,
                        homework
                    )
                );

                newEvents[key] =
                    buildSavedEvent(
                        lesson,
                        saved.googleEventId,
                        fingerprint
                    );

                updated++;

                console.log(
                    `✏️ Обновлено: ${lesson.subject}`
                );
            } else {
                const recreated =
                    await createGoogleEvent(
                        calendar,
                        lesson
                    );

                newEvents[key] =
                    buildSavedEvent(
                        lesson,
                        recreated.id,
                        fingerprint
                    );

                created++;

                console.log(
                    `➕ Создано заново: ${lesson.subject}`
                );
            }
        } catch (error) {
            errors++;

            console.error(
                `❌ Ошибка "${lesson.subject}":`,
                error.message
            );
        }
    }


    // --------------------------------------------------------
    // MISSING FUTURE LESSONS
    // --------------------------------------------------------

    console.log("");
    console.log(
        "🔎 Проверяем исчезнувшие будущие занятия..."
    );

    for (
        const [key, saved]
        of Object.entries(savedEvents)
    ) {
        if (
            currentKeys.has(key)
        ) {
            continue;
        }

        if (!saved) {
            continue;
        }

        // Старую запись без даты
        // теперь миграция должна была восстановить.
        if (!saved.date) {
            console.log(
                `⚠️ Не удалось определить дату: ${key}`
            );

            continue;
        }

        // Прошедшие никогда не трогаем.
        if (
            isPastDate(
                saved.date
            )
        ) {
            console.log(
                `⏭️ Прошедшее событие сохранено: ${key}`
            );

            continue;
        }

        // Уже отменено.
        if (
            saved.cancelled
        ) {
            continue;
        }

        try {
            const googleEvent =
                await getGoogleEvent(
                    calendar,
                    saved.googleEventId
                );

            if (!googleEvent) {
                console.log(
                    `⚠️ Google-событие не найдено: ${key}`
                );

                newEvents[key] = {
                    ...saved,

                    cancelled: true,

                    lastSync:
                        new Date().toISOString()
                };

                continue;
            }

            // Находим следующее занятие
            // того же предмета.
            const nextLesson =
                findNextLesson(
                    lessons,
                    saved
                );

            let transferred = false;

            if (nextLesson) {
                const nextKey =
                    getEventKey(
                        nextLesson
                    );

                const nextSaved =
                    newEvents[nextKey];

                transferred =
                    await transferHomework(
                        calendar,
                        googleEvent,
                        nextSaved,
                        nextLesson
                    );

                if (transferred) {
                    homeworkTransferred++;

                    console.log(
                        `📝 ДЗ перенесено: ${saved.subject} → ${nextLesson.date}`
                    );
                }
            }

            // Старую пару не удаляем.
            // Только помечаем как отменённую.
            await cancelGoogleEvent(
                calendar,
                googleEvent
            );

            newEvents[key] = {
                ...saved,

                cancelled: true,

                transferredToKey:
                    nextLesson
                        ? getEventKey(
                            nextLesson
                        )
                        : null,

                lastSync:
                    new Date().toISOString()
            };

            cancelled++;

            console.log(
                `❌ Отменено: ${saved.subject} ${saved.date}`
            );
        } catch (error) {
            errors++;

            console.error(
                `❌ Ошибка обработки ${key}:`,
                error.message
            );
        }
    }


    // --------------------------------------------------------
    // SAVE
    // --------------------------------------------------------

    saveSavedEvents(
        newEvents
    );


    // --------------------------------------------------------
    // RESULT
    // --------------------------------------------------------

    console.log("");
    console.log(
        "=========================="
    );

    console.log(
        "📊 РЕЗУЛЬТАТ СИНХРОНИЗАЦИИ"
    );

    console.log(
        `➕ Создано: ${created}`
    );

    console.log(
        `✏️ Обновлено: ${updated}`
    );

    console.log(
        `⏭️ Без изменений: ${skipped}`
    );

    console.log(
        `❌ Отменено: ${cancelled}`
    );

    console.log(
        `📝 ДЗ перенесено: ${homeworkTransferred}`
    );

    console.log(
        `🗑️ Удалено: 0`
    );

    console.log(
        `❌ Ошибок: ${errors}`
    );

    console.log(
        "=========================="
    );
}

module.exports = {
    syncSchedule
};