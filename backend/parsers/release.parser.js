/**
 * Release Parser
 * Parses JNTUH home.jsp release listing and constructs Result Releases and Result Groups.
 */

const cheerio = require("cheerio");
const { cleanText } = require("../utils/normalization.utils");

function parseReleaseTitle(title) {
    const clean = cleanText(title);
    const lower = clean.toLowerCase();

    const isBTech = (lower.includes("b.tech") || lower.includes("btech")) && !lower.includes("pharmacy");
    const isRCRV = lower.includes("rc/rv") || lower.includes("revaluation") || lower.includes("gradercrv");
    const isMinor = lower.includes("minor");

    const regMatch = clean.match(/\(R(25|22|18|16|15|13|09)\)/i);
    const regulation = regMatch ? `R${regMatch[1]}` : null;

    let year = null;
    if (/\bIV\s*(Year|Yr)/i.test(clean)) year = 4;
    else if (/\bIII\s*(Year|Yr)/i.test(clean)) year = 3;
    else if (/\bII\s*(Year|Yr)/i.test(clean)) year = 2;
    else if (/\bI\s*(Year|Yr)/i.test(clean)) year = 1;

    let sem = null;
    if (/\bII\s*Sem/i.test(clean)) sem = 2;
    else if (/\bI\s*Sem/i.test(clean)) sem = 1;
    else if (year === 1 && !/\bII\s*Sem/i.test(clean)) sem = 1;

    const semester = (year && sem) ? `${year}-${sem}` : null;

    let attemptType = "SUPPLY";
    if (isRCRV) {
        attemptType = "RCRV";
    } else if (lower.includes("regular")) {
        attemptType = "REGULAR";
    } else if (lower.includes("supplementary") || lower.includes("supply") || lower.includes("supple")) {
        attemptType = "SUPPLY";
    }

    return {
        title: clean,
        isBTech,
        isRCRV,
        isMinor,
        regulation,
        semester,
        attemptType,
        degree: "BTECH"
    };
}

function parseHomeJspCatalog(html) {
    const $ = cheerio.load(html);
    const catalog = [];

    $("a[href*='examCode=']").each((_, el) => {
        const href = $(el).attr("href");
        const title = $(el).text();
        const dateText = cleanText($(el).closest("tr").find("td").last().text());
        const urlParams = new URLSearchParams(href.split("?")[1] || "");
        const examCode = urlParams.get("examCode");
        const etype = urlParams.get("etype") || "r17";
        const typeParam = urlParams.get("type") || "intgrade";
        const resultParam = urlParams.get("result") || null;

        if (examCode && title) {
            const parsed = parseReleaseTitle(title);
            if (parsed.isBTech && !parsed.isMinor && parsed.regulation && parsed.semester) {
                const groupId = `${parsed.semester}_${parsed.regulation}_${parsed.degree}`;
                const releaseId = `${examCode}_${parsed.attemptType}`;

                catalog.push({
                    releaseId,
                    groupId,
                    examCode,
                    semester: parsed.semester,
                    regulation: parsed.regulation,
                    degree: parsed.degree,
                    attemptType: parsed.attemptType,
                    title: parsed.title,
                    publishedDate: dateText,
                    request: {
                        etype,
                        type: typeParam,
                        result: resultParam
                    }
                });
            }
        }
    });

    return catalog;
}

module.exports = {
    parseReleaseTitle,
    parseHomeJspCatalog
};
