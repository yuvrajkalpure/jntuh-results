/**
 * String and Text Normalization Utilities
 */

function cleanText(text) {
    if (!text) return "";
    return String(text).replace(/\s+/g, " ").trim();
}

function normalizeHTNO(htno) {
    return cleanText(htno).toUpperCase();
}

module.exports = {
    cleanText,
    normalizeHTNO
};
