const fs = require("fs");
const path = require("path");

const {
    google
} = require("googleapis");

const {
    getAuthClient
} = require("./googleCalendar");

function getLessonFingerprint(lesson) {
    return JSON.stringify({
        lessonId: String(lesson.lessonId),
        date: lesson.date,
        timeStart: lesson.timeStart,
        timeEnd: lesson.timeEnd,
        subject: lesson.subject || "",
        teacher: lesson.teacher || "",
        type: lesson.type || "",
        room: lesson.room || "",
        building: lesson.building || "",
        stream: lesson.stream || "",
    });
}

const DATA_DIR =
    path.join(__dirname, "../data");

const DATA_FILE =
    path.join(DATA_DIR, "events.json");


/*
 * Создаём папку data
 */
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(
        DATA_DIR,
        {
            recursive: true
        }
    );
}



/*
 * Загрузка локальной базы событий
 */
function loadEvents() {

    if (!fs.existsSync(DATA_FILE)) {
        return {};
    }

    try {

        const content =
            fs.readFileSync(
                DATA_FILE,
                "utf8"
            ).trim();


        if (!content) {
            return {};
        }


        return JSON.parse(content);

    } catch (error) {

        console.log(
            "⚠️ Не удалось прочитать events.json"
        );

        console.log(
            "⚠️ Создаём новую локальную базу"
        );

        return {};
    }
}


/*
 * Сохранение локальной базы
 */
function saveEvents(events) {

    fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(
            events,
            null,
            2
        ),
        "utf8"
    );
}


/*
 * Уникальный ключ занятия
 *
 * Используем lessonOid из API ФУ.
 */
function getEventKey(lesson) {

    if (lesson.lessonId) {
        return `lesson_${lesson.lessonId}`;
    }


    /*
     * Запасной вариант
     */
    return [
        lesson.date,
        lesson.timeStart,
        lesson.subject
    ].join("_");
}


/*
 * Данные события для Google Calendar
 */
function buildGoogleEvent(lesson) {

    const location = [

        lesson.room,

        lesson.building

    ]
        .filter(Boolean)
        .join(", ");


    const description = [

        `📚 Предмет: ${lesson.subject}`,

        `👨‍🏫 Преподаватель: ${
            lesson.teacher || "-"
        }`,

        `📖 Тип занятия: ${
            lesson.type || "-"
        }`,

        lesson.stream
            ? `👥 Поток: ${lesson.stream}`
            : "",

        "",

        "🎓 Финансовый университет",

        `🆔 ID занятия ФУ: ${
            lesson.lessonId || "-"
        }`

    ]
        .filter(Boolean)
        .join("\n");


    return {

        summary:
            lesson.subject,

        location,

        description,

        start: {
            dateTime:
                lesson.startDateTime,

            timeZone:
                process.env.TIMEZONE ||
                "Europe/Moscow"
        },

        end: {
            dateTime:
                lesson.endDateTime,

            timeZone:
                process.env.TIMEZONE ||
                "Europe/Moscow"
        }
    };
}


/*
 * Создаём "отпечаток" занятия.
 *
 * Если хоть одно важное поле изменилось,
 * Google событие будет обновлено.
 */
function createFingerprint(lesson) {

    return JSON.stringify({

        lessonId:
            String(lesson.lessonId || ""),

        subject:
            lesson.subject || "",

        teacher:
            lesson.teacher || "",

        type:
            lesson.type || "",

        room:
            lesson.room || "",

        building:
            lesson.building || "",

        stream:
            lesson.stream || "",

        startDateTime:
            lesson.startDateTime || "",

        endDateTime:
            lesson.endDateTime || ""

    });
}


/*
 * Основная синхронизация
 */
async function syncSchedule(lessons) {

    const auth =
        await getAuthClient();


    const calendar =
        google.calendar({
            version: "v3",
            auth
        });


    const calendarId =
        process.env.GOOGLE_CALENDAR_ID;


    if (!calendarId) {

        throw new Error(
            "GOOGLE_CALENDAR_ID отсутствует в .env"
        );
    }


    /*
     * Локальная база событий
     */
    const savedEvents =
        loadEvents();


    /*
     * Новая версия базы
     */
    const newEvents = {};


    /*
     * Все занятия, полученные сейчас
     */
    const currentKeys =
        new Set();


    let created = 0;
    let updated = 0;
    let skipped = 0;
    let deleted = 0;
    let errors = 0;


    console.log(
        "\n🔄 Начинаем сравнение расписания..."
    );


    /*
     * ==========================
     * СОЗДАНИЕ / ОБНОВЛЕНИЕ
     * ==========================
     */

    for (const lesson of lessons) {

        const key =
            getEventKey(lesson);


        currentKeys.add(key);


        const fingerprint =
            createFingerprint(lesson);


        const googleEvent =
            buildGoogleEvent(lesson);


        const saved =
            savedEvents[key];


        try {

            /*
             * НОВОЕ СОБЫТИЕ
             */
            if (!saved) {

                const response =
                    await calendar.events.insert({

                        calendarId,

                        requestBody:
                            googleEvent

                    });


                newEvents[key] = {

                    googleEventId:
                        response.data.id,

                    fingerprint,

                    lessonId:
                        lesson.lessonId,

                    lastSync:
                        new Date()
                            .toISOString()

                };


                created++;

                console.log(
                    `➕ Создано: ${lesson.subject}`
                );

                continue;
            }


            /*
             * СОБЫТИЕ НЕ ИЗМЕНИЛОСЬ
             */
            if (
                saved.fingerprint ===
                fingerprint
            ) {

                newEvents[key] = {

                    ...saved,

                    lastSync:
                        new Date()
                            .toISOString()

                };


                skipped++;

                console.log(
                    `⏭️ Без изменений: ${lesson.subject}`
                );

                continue;
            }


            /*
             * СОБЫТИЕ ИЗМЕНИЛОСЬ
             */
            const response =
                await calendar.events.update({

                    calendarId,

                    eventId:
                        saved.googleEventId,

                    requestBody:
                        googleEvent

                });


            newEvents[key] = {

                googleEventId:
                    response.data.id,

                fingerprint,

                lessonId:
                    lesson.lessonId,

                lastSync:
                    new Date()
                        .toISOString()

            };


            updated++;

            console.log(
                `✏️ Обновлено: ${lesson.subject}`
            );

        }

        catch (error) {

            errors++;

            console.error(
                `❌ Ошибка: ${lesson.subject}`
            );

            console.error(
                error.message
            );


            /*
             * Не теряем старую запись,
             * если Google временно недоступен
             */
            if (saved) {

                newEvents[key] =
                    saved;
            }
        }
    }


    /*
     * ==========================
     * УДАЛЕНИЕ ОТМЕНЁННЫХ ПАР
     * ==========================
     */

    console.log(
        "\n🗑️ Проверяем отменённые занятия..."
    );


    for (
        const key of Object.keys(
            savedEvents
        )
    ) {

        /*
         * Если занятие всё ещё существует —
         * ничего не удаляем.
         */
        if (
            currentKeys.has(key)
        ) {
            continue;
        }


        const saved =
            savedEvents[key];


        /*
         * Защита от старого формата
         */
        if (!saved.googleEventId) {
            continue;
        }


        try {

            await calendar.events.delete({

                calendarId,

                eventId:
                    saved.googleEventId

            });


            deleted++;

            console.log(
                `🗑️ Удалено отменённое занятие: ${key}`
            );

        }

        catch (error) {

            /*
             * 404 означает, что событие
             * уже удалено вручную.
             */
            if (
                error.code === 404 ||
                error.status === 404
            ) {

                console.log(
                    `ℹ️ Событие уже отсутствует: ${key}`
                );

                continue;
            }


            errors++;

            console.error(
                `❌ Ошибка удаления: ${key}`
            );


            console.error(
                error.message
            );


            /*
             * Сохраняем запись,
             * чтобы попробовать удалить
             * её при следующей синхронизации
             */
            newEvents[key] =
                saved;
        }
    }


    /*
     * ==========================
     * СОХРАНЯЕМ НОВУЮ БАЗУ
     * ==========================
     */

    saveEvents(newEvents);


    /*
     * ==========================
     * ИТОГ
     * ==========================
     */

    console.log(
        "\n=========================="
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
        `🗑️ Удалено: ${deleted}`
    );

    console.log(
        `❌ Ошибок: ${errors}`
    );

    console.log(
        "==========================\n"
    );


    console.log(
        "✅ Синхронизация завершена"
    );
}


module.exports = {
    syncSchedule
};