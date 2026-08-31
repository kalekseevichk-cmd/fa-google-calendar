const fs = require("fs");
const path = require("path");
const http = require("http");
const { URL } = require("url");

const {
    getAuthClient,
    SCOPES,
    TOKEN_PATH
} = require("./googleCalendar");

const PORT = 3001;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;


async function authorize() {

    const authClient = getAuthClient();

    // Если токен уже есть
    if (fs.existsSync(TOKEN_PATH)) {
        console.log("✅ Токен уже существует");
        return;
    }

    // Устанавливаем redirect URI
    authClient.redirectUri = REDIRECT_URI;

    const authUrl = authClient.generateAuthUrl({
        access_type: "offline",
        scope: SCOPES,
        prompt: "consent"
    });


    // Локальный сервер для получения ответа от Google
    const server = http.createServer(async (req, res) => {

        try {

            const requestUrl = new URL(
                req.url,
                REDIRECT_URI
            );

            // Проверяем правильный путь
            if (
                requestUrl.pathname !== "/oauth2callback"
            ) {
                res.writeHead(404);
                res.end("Not found");
                return;
            }


            const code =
                requestUrl.searchParams.get("code");

            const error =
                requestUrl.searchParams.get("error");


            if (error) {

                console.error(
                    "❌ Google OAuth ошибка:",
                    error
                );

                res.writeHead(400, {
                    "Content-Type":
                        "text/html; charset=utf-8"
                });

                res.end(`
                    <h1>Ошибка авторизации</h1>
                    <p>${error}</p>
                `);

                server.close();
                return;
            }


            if (!code) {

                res.writeHead(400);

                res.end(
                    "Код авторизации не получен"
                );

                return;
            }


            console.log(
                "\n🔄 Получен код авторизации..."
            );


            // Получаем токены
            const { tokens } =
                await authClient.getToken({
                    code,
                    redirect_uri: REDIRECT_URI
                });


            authClient.setCredentials(tokens);


            // Сохраняем токен
            fs.writeFileSync(
                TOKEN_PATH,
                JSON.stringify(tokens, null, 2)
            );


            res.writeHead(200, {
                "Content-Type":
                    "text/html; charset=utf-8"
            });


            res.end(`
                <!DOCTYPE html>
                <html>
                    <head>
                        <title>Авторизация завершена</title>
                    </head>
                    <body style="
                        font-family: Arial;
                        text-align: center;
                        padding: 100px;
                    ">
                        <h1>✅ Авторизация успешно завершена</h1>
                        <p>Можешь закрыть это окно.</p>
                    </body>
                </html>
            `);


            console.log(
                "\n✅ Авторизация успешно завершена!"
            );

            console.log(
                "📁 Создан файл token.json"
            );


            // Закрываем сервер через секунду
            setTimeout(() => {

                server.close(() => {

                    console.log(
                        "🔒 Локальный сервер остановлен"
                    );

                    process.exit(0);

                });

            }, 1000);


        }

        catch (error) {

            console.error(
                "❌ Ошибка:",
                error
            );

            res.writeHead(500);

            res.end(
                "Ошибка авторизации"
            );

        }

    });


    server.listen(PORT, () => {

        console.log(
            "\n🟢 Локальный OAuth сервер запущен"
        );

        console.log(
            `📍 ${REDIRECT_URI}`
        );

        console.log(
            "\n🔐 Открой ссылку:\n"
        );

        console.log(authUrl);

        console.log(
            "\n⏳ Ожидание авторизации Google..."
        );

    });

}


authorize();