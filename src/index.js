require("dotenv").config();

const cron = require("node-cron");

const {
    getSchedule
} = require("./schedule");

const {
    syncSchedule
} = require("./sync");


let isSyncRunning = false;


async function runSync() {

    if (isSyncRunning) {

        console.log(
            "⏳ Предыдущая синхронизация ещё выполняется. Пропускаем запуск."
        );

        return;
    }

    isSyncRunning = true;

    console.log("\n==========================");
    console.log("🔄 ЗАПУСК СИНХРОНИЗАЦИИ");

    console.log(
        new Date().toLocaleString(
            "ru-RU",
            {
                timeZone:
                    process.env.TIMEZONE ||
                    "Europe/Moscow"
            }
        )
    );

    console.log("==========================\n");


    try {

        const groupName =
            process.env.GROUP_NAME;

        if (!groupName) {

            throw new Error(
                "GROUP_NAME не указан в .env"
            );
        }


        /*
         * Получаем настоящее расписание
         */
        const lessons =
            await getSchedule(groupName);


        console.log(
            `\n📚 Найдено пар: ${lessons.length}`
        );


        /*
         * Синхронизируем с Google Calendar
         */
        await syncSchedule(lessons);


        console.log(
            "\n🎉 ГОТОВО"
        );

    }

    catch (error) {

        console.error(
            "\n❌ ОШИБКА СИНХРОНИЗАЦИИ"
        );

        console.error(
            error.message
        );

        if (error.response) {

            console.error(
                "\nОтвет API:"
            );

            console.error(
                JSON.stringify(
                    error.response.data,
                    null,
                    2
                )
            );
        }

    }

    finally {

        isSyncRunning = false;

    }
}


/*
 * Запуск сразу после старта
 */
runSync();


/*
 * Каждые 15 минут
 */
cron.schedule(
    "*/15 * * * *",
    () => {

        console.log(
            "\n⏰ Плановая проверка"
        );

        runSync();

    },
    {
        timezone:
            process.env.TIMEZONE ||
            "Europe/Moscow"
    }
);


console.log(
    "🟢 Сервис запущен"
);

console.log(
    "⏰ Проверка расписания каждые 15 минут"
);