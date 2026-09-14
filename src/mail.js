const imaps = require("imap-simple");
const { simpleParser } = require("mailparser");

const MAIL_HOST = process.env.MAIL_HOST || "imap.yandex.ru";
const MAIL_PORT = Number(process.env.MAIL_PORT) || 993;
const MAIL_USER = process.env.MAIL_USER;
const MAIL_APP_PASSWORD = process.env.MAIL_APP_PASSWORD;


function isMailConfigured() {
    return Boolean(
        MAIL_USER &&
        MAIL_APP_PASSWORD
    );
}


function normalize(text) {
    return (text || "")
        .trim()
        .toLowerCase();
}


// ============================================================
// CONNECTION
// ============================================================

async function connect() {
    return imaps.connect({
        imap: {
            user: MAIL_USER,
            password: MAIL_APP_PASSWORD,
            host: MAIL_HOST,
            port: MAIL_PORT,
            tls: true,
            authTimeout: 15000
        }
    });
}


// ============================================================
// FOLDERS
// ============================================================

function flattenBoxNames(boxes, prefix = "") {
    let names = [];

    for (const [name, box] of Object.entries(boxes)) {
        const fullName =
            prefix
                ? `${prefix}${box.delimiter}${name}`
                : name;

        names.push(fullName);

        if (box.children) {
            names = names.concat(
                flattenBoxNames(box.children, fullName)
            );
        }
    }

    return names;
}

async function getFolderNames(connection) {
    const boxes = await connection.getBoxes();

    return flattenBoxNames(boxes);
}

function findFolderForSubject(folderNames, subject) {
    const normalizedSubject = normalize(subject);

    if (!normalizedSubject) {
        return null;
    }

    const exactMatch = folderNames.find(
        name => normalize(name) === normalizedSubject
    );

    if (exactMatch) {
        return exactMatch;
    }

    return folderNames.find(name => {
        const normalizedName = normalize(name);

        return (
            normalizedName.includes(normalizedSubject) ||
            normalizedSubject.includes(normalizedName)
        );
    }) || null;
}


// ============================================================
// MESSAGES
// ============================================================

async function getLatestMessageText(connection, folderName) {
    await connection.openBox(folderName);

    const messages = await connection.search(
        ["ALL"],
        {
            bodies: [""],
            struct: true
        }
    );

    if (!messages.length) {
        return "";
    }

    messages.sort(
        (a, b) =>
            new Date(b.attributes.date) -
            new Date(a.attributes.date)
    );

    const latest = messages[0];

    const rawBody =
        latest.parts.find(
            part => part.which === ""
        )?.body;

    if (!rawBody) {
        return "";
    }

    const parsed = await simpleParser(rawBody);

    return (parsed.text || "").trim();
}


// ============================================================
// PUBLIC API
// ============================================================

/**
 * Для каждого переданного предмета ищет одноимённую
 * папку в почте и забирает текст последнего письма в ней.
 *
 * Возвращает { [subject]: homeworkText }
 */
async function getHomeworkBySubject(subjects) {
    if (!isMailConfigured()) {
        return {};
    }

    const uniqueSubjects = [
        ...new Set(subjects.filter(Boolean))
    ];

    if (!uniqueSubjects.length) {
        return {};
    }

    let connection;

    const result = {};

    try {
        connection = await connect();

        const folderNames =
            await getFolderNames(connection);

        for (const subject of uniqueSubjects) {
            try {
                const folderName =
                    findFolderForSubject(
                        folderNames,
                        subject
                    );

                if (!folderName) {
                    continue;
                }

                const text =
                    await getLatestMessageText(
                        connection,
                        folderName
                    );

                if (text) {
                    result[subject] = text;
                }
            } catch (error) {
                console.error(
                    `❌ Ошибка чтения почты для предмета "${subject}":`,
                    error.message
                );
            }
        }
    } catch (error) {
        console.error(
            "❌ Ошибка подключения к почте:",
            error.message
        );
    } finally {
        if (connection) {
            connection.end();
        }
    }

    return result;
}


module.exports = {
    isMailConfigured,
    getHomeworkBySubject
};
