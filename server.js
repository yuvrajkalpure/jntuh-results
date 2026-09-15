const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const NodeCache = require("node-cache");

const app = express();

const PORT = process.env.PORT || 3000;


/*
 * Cache
 *
 * stdTTL = 1 hour
 *
 * If the same HTNO is requested again
 * within 1 hour, JNTUH will NOT be contacted.
 */
const resultCache = new NodeCache({
    stdTTL: 60 * 60,
    checkperiod: 120
});


/*
 * Serve index.html from root
 */

app.get("/", (req, res) => {

    res.sendFile(__dirname + "/index.html");

});


/*
 * Result API
 */

app.get("/api/result", async (req, res) => {

    try {

        const htno =
            req.query.htno
                ?.trim()
                .toUpperCase();


        /*
         * Validate HTNO
         */

        if (!htno) {

            return res.status(400).json({

                success: false,

                message: "Hall Ticket Number is required."

            });

        }


        if (!/^[A-Z0-9]+$/.test(htno)) {

            return res.status(400).json({

                success: false,

                message: "Invalid Hall Ticket Number."

            });

        }


        /*
         * ---------------------------------
         * CHECK CACHE
         * ---------------------------------
         */

        const cachedResult =
            resultCache.get(htno);


        if (cachedResult) {

            console.log(
                `CACHE HIT: ${htno}`
            );


            return res.json({

                ...cachedResult,

                cached: true

            });

        }


        console.log(
            `CACHE MISS: ${htno}`
        );


        /*
         * ---------------------------------
         * JNTUH REQUEST
         * ---------------------------------
         */

        const body = new URLSearchParams({

            degree: "btech",

            examCode: "1964",

            etype: "r17",

            result: "null",

            grad: "null",

            type: "intgrade",

            htno: htno

        });


        const response = await axios.post(

            "http://results.jntuh.ac.in/results/resultAction",

            body.toString(),

            {

                headers: {

                    "Content-Type":
                        "application/x-www-form-urlencoded",

                    "User-Agent":
                        "Mozilla/5.0",

                    "Referer":
                        "http://results.jntuh.ac.in/results/jsp/" +
                        "SearchResult.jsp?degree=btech" +
                        "&examCode=1964" +
                        "&etype=r17" +
                        "&type=intgrade"

                },

                timeout: 20000,

                responseType: "text"

            }

        );


        /*
         * ---------------------------------
         * PARSE HTML
         * ---------------------------------
         */

        const html =
            response.data;


        const $ =
            cheerio.load(html);


        const resultTable =
            findResultTable($);


        /*
         * No result found
         */

        if (!resultTable) {

            const responseData = {

                success: false,

                message:
                    "Result table was not found.",

                htno: htno

            };


            /*
             * Don't cache failures.
             */

            return res.json(responseData);

        }


        /*
         * ---------------------------------
         * CREATE RESULT
         * ---------------------------------
         */

        const resultData = {

            success: true,

            htno: htno,

            table: resultTable

        };


        /*
         * ---------------------------------
         * STORE CACHE
         * ---------------------------------
         */

        resultCache.set(
            htno,
            resultData
        );


        console.log(
            `CACHED: ${htno}`
        );


        res.json({

            ...resultData,

            cached: false

        });


    } catch (error) {

        console.error(
            "JNTUH ERROR:",
            error.message
        );


        res.status(500).json({

            success: false,

            message:
                "Unable to retrieve result from JNTUH."

        });

    }

});


/*
 * ---------------------------------------
 * FIND RESULT TABLE
 * ---------------------------------------
 */

function findResultTable($) {

    let bestTable = null;

    let bestScore = 0;


    $("table").each(
        (index, table) => {

            const text =
                $(table)
                    .text()
                    .replace(/\s+/g, " ")
                    .trim()
                    .toLowerCase();


            let score = 0;


            /*
             * Words commonly found
             * in JNTUH result tables.
             */

            const keywords = [

                "subject",

                "code",

                "grade",

                "credits",

                "internal",

                "external",

                "marks",

                "result"

            ];


            keywords.forEach(
                keyword => {

                    if (
                        text.includes(keyword)
                    ) {

                        score++;

                    }

                }
            );


            /*
             * Ignore tiny tables.
             */

            const rowCount =
                $(table)
                    .find("tr")
                    .length;


            if (rowCount >= 2) {

                score += 1;

            }


            /*
             * Keep highest scoring table.
             */

            if (score > bestScore) {

                bestScore = score;

                bestTable = table;

            }

        }
    );


    if (!bestTable) {

        return null;

    }


    /*
     * Convert selected table
     * into JSON.
     */

    const rows = [];


    $(bestTable)
        .find("tr")
        .each(
            (rowIndex, row) => {

                const cells = [];


                $(row)
                    .find("th, td")
                    .each(
                        (cellIndex, cell) => {

                            cells.push(

                                $(cell)
                                    .text()
                                    .replace(/\s+/g, " ")
                                    .trim()

                            );

                        }
                    );


                if (cells.length > 0) {

                    rows.push(cells);

                }

            }
        );


    return rows;

}


/*
 * ---------------------------------------
 * START SERVER
 * ---------------------------------------
 */

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `Server running on port ${PORT}`
        );

    }
);            degree: "btech",
            examCode: "1964",
            etype: "r17",
            result: "null",
            grad: "null",
            type: "intgrade",
            htno: htno
        });

        const response = await axios.post(
            "http://results.jntuh.ac.in/results/resultAction",
            body.toString(),
            {
                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded",

                    "User-Agent":
                        "Mozilla/5.0",

                    "Referer":
                        "http://results.jntuh.ac.in/results/jsp/" +
                        "SearchResult.jsp?degree=btech" +
                        "&examCode=1964" +
                        "&etype=r17" +
                        "&type=intgrade"
                },

                timeout: 20000,

                responseType: "text"
            }
        );

        console.log(
            "JNTUH status:",
            response.status
        );

        const html = response.data;

        const $ = cheerio.load(html);

        const tables = [];

        $("table").each((index, table) => {

            const rows = [];

            $(table)
                .find("tr")
                .each((index, row) => {

                    const cells = [];

                    $(row)
                        .find("th, td")
                        .each((index, cell) => {

                            cells.push(
                                $(cell)
                                    .text()
                                    .replace(/\s+/g, " ")
                                    .trim()
                            );

                        });

                    if (cells.length > 0) {
                        rows.push(cells);
                    }

                });

            if (rows.length > 0) {
                tables.push(rows);
            }

        });

        res.json({
            success: true,
            htno: htno,
            tables: tables
        });

    } catch (error) {

        console.error(
            "JNTUH ERROR:",
            error.message
        );

        res.status(500).json({
            success: false,
            message:
                "Could not retrieve JNTUH result",
            error:
                error.message
        });
    }
});


app.listen(PORT, "0.0.0.0", () => {

    console.log(
        `Server running on port ${PORT}`
    );

});
