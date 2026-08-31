const axios = require("axios");

const BASE_URL = "https://ruz.fa.ru/api";


function formatDateForApi(date) {
    const year = date.getFullYear();

    const month = String(
        date.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
        date.getDate()
    ).padStart(2, "0");

    return `${year}.${month}.${day}`;
}


/**
 * Поиск группы
 */
async function findGroup(groupName) {

    console.log(`🔎 Ищем группу: ${groupName}`);

    const response = await axios.get(
        `${BASE_URL}/search`,
        {
            params: {
                term: groupName
            },
            timeout: 15000
        }
    );

    const groups = response.data;

    if (!Array.isArray(groups)) {
        throw new Error(
            "API вернул неожиданный формат поиска"
        );
    }


    const exactGroup = groups.find((item) => {

        const name =
            item.name ||
            item.label ||
            item.title ||
            "";

        return (
            name.trim().toUpperCase() ===
            groupName.trim().toUpperCase()
        );

    });


    if (!exactGroup) {

        console.log(
            JSON.stringify(groups, null, 2)
        );

        throw new Error(
            `Группа ${groupName} не найдена`
        );
    }


    console.log(
        `✅ Найдена группа: ${groupName}`
    );

    return exactGroup;
}


/**
 * Получение расписания
 */
async function getRawSchedule(
    groupId,
    startDate,
    finishDate
) {

    console.log(
        `📅 Загружаем расписание: ${startDate} → ${finishDate}`
    );

    const response = await axios.get(
        `${BASE_URL}/schedule/group/${groupId}`,
        {
            params: {
                start: startDate,
                finish: finishDate,
                lng: 1
            },

            timeout: 20000
        }
    );

    return response.data;
}


/**
 * Создание ISO даты
 */
function buildDateTime(date, time) {

    if (!date || !time) {
        return null;
    }

    return `${date}T${time}:00`;
}


/**
 * Нормализация реального урока ФУ
 */
function normalizeLesson(item) {

    return {

        /*
         * Уникальный ID занятия из API ФУ.
         * Это важнее даты + предмета.
         */
        lessonId: String(item.lessonOid),

        date: item.date,

        timeStart: item.beginLesson,

        timeEnd: item.endLesson,

        subject:
            item.discipline ||
            "Без названия",

        teacher:
            item.lecturer_title ||
            item.lecturer ||
            "",

        type:
            item.kindOfWork ||
            "",

        room:
            item.auditorium ||
            "",

        building:
            item.building ||
            "",

        stream:
            item.stream ||
            "",

        startDateTime:
            buildDateTime(
                item.date,
                item.beginLesson
            ),

        endDateTime:
            buildDateTime(
                item.date,
                item.endLesson
            ),

        /*
         * Оригинальный объект.
         * Пока оставляем для диагностики.
         */
        original: item
    };
}


/**
 * Получить расписание
 * ближайших 28 дней
 */
async function getSchedule(groupName) {

    const group =
        await findGroup(groupName);


    const groupId =
        group.id ||
        group.value ||
        group.oid ||
        group.groupOid;


    if (!groupId) {

        console.log(
            "Данные группы:"
        );

        console.log(
            JSON.stringify(group, null, 2)
        );

        throw new Error(
            "Не найден ID группы"
        );
    }


    console.log(
        `🆔 ID группы: ${groupId}`
    );


    const now = new Date();

    const futureDate =
        new Date(now);

    futureDate.setDate(
        futureDate.getDate() + 28
    );


    const startDate =
        formatDateForApi(now);

    const finishDate =
        formatDateForApi(futureDate);


    const rawSchedule =
        await getRawSchedule(
            groupId,
            startDate,
            finishDate
        );


    /*
     * API возвращает массив занятий
     */
    const lessons =
        Array.isArray(rawSchedule)
            ? rawSchedule
            : (
                rawSchedule.lessons ||
                rawSchedule.data ||
                []
            );


    console.log(
        `📦 API вернул записей: ${lessons.length}`
    );


    /*
     * Преобразуем формат API → формат Calendar
     */
    const normalizedLessons =
        lessons
            .filter((item) => {

                return (
                    item.date &&
                    item.beginLesson &&
                    item.endLesson &&
                    item.discipline
                );

            })
            .map(normalizeLesson);


    console.log(
        `📚 Получено занятий: ${normalizedLessons.length}`
    );


    return normalizedLessons;
}


module.exports = {
    getSchedule
};