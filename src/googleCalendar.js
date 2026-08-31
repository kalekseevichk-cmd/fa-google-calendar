const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const TOKEN_PATH = path.join(
    process.cwd(),
    "token.json"
);

const CREDENTIALS_PATH = path.join(
    process.cwd(),
    "credentials.json"
);

const REDIRECT_URI =
    "http://localhost:3001/oauth2callback";

const SCOPES = [
    "https://www.googleapis.com/auth/calendar"
];


function getAuthClient() {

    if (!fs.existsSync(CREDENTIALS_PATH)) {
        throw new Error(
            "❌ Файл credentials.json не найден"
        );
    }

    const credentials = JSON.parse(
        fs.readFileSync(
            CREDENTIALS_PATH,
            "utf8"
        )
    );

    /*
     * Поддержка двух типов OAuth:
     *
     * Desktop app → installed
     * Web application → web
     */
    const config =
        credentials.web ||
        credentials.installed;

    if (!config) {
        throw new Error(
            "❌ Неверный формат credentials.json. " +
            "Не найден блок 'web' или 'installed'."
        );
    }

    const {
        client_id,
        client_secret
    } = config;


    const oAuth2Client =
        new google.auth.OAuth2(
            client_id,
            client_secret,
            REDIRECT_URI
        );


    /*
     * Если токен уже существует —
     * автоматически подключаем его
     */
    if (fs.existsSync(TOKEN_PATH)) {

        const token = JSON.parse(
            fs.readFileSync(
                TOKEN_PATH,
                "utf8"
            )
        );

        oAuth2Client.setCredentials(token);
    }


    return oAuth2Client;
}


function getCalendar() {

    const auth = getAuthClient();

    return google.calendar({
        version: "v3",
        auth
    });
}


module.exports = {
    getAuthClient,
    getCalendar,
    SCOPES,
    TOKEN_PATH,
    REDIRECT_URI
};