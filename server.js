const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const NodeCache = require("node-cache");

const app = express();

const PORT = process.env.PORT || 3000;


/*
|--------------------------------------------------------------------------
| CACHE
|--------------------------------------------------------------------------
|
| Store results for 1 hour.
|
*/

const resultCache = new NodeCache({
    stdTTL: 60 * 60,
    checkperiod: 120
});


/*
|--------------------------------------------------------------------------
| SERVE index.html
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {

    res.sendFile(__dirname + "/index.html");

});


/*
|--------------------------------------------------------------------------
| RESULT API
|--------------------------------------------------------------------------
*/

app.get("/api/result", async (req, res) => {

    try {

        const htno = req.query.htno
            ?.trim()
            .toUpperCase();


        /*
        | Validate HTNO
        */

        if (!htno) {

            return res.status(400).json({

                success: false,

                message:
                    "Hall Ticket Number is required."

            });

        }


        if (!/^[A-Z0-9]+$/.test(htno)) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid Hall Ticket Number."

            });

        }


        /*
        |--------------------------------------------------------------------------
        | CHECK CACHE
        |--------------------------------------------------------------------------
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
        |--------------------------------------------------------------------------
        | JNTUH FORM DATA
        |--------------------------------------------------------------------------
        */

        const formData = new URLSearchParams();

        formData.append("degree", "btech");
        formData.append("examCode", "1964");
        formData.append("etype", "r17");
        formData.append("result", "null");
        formData.append("grad", "null");
        formData.append("type", "intgrade");
        formData.append("htno", htno);


        /*
        |--------------------------------------------------------------------------
        | REQUEST JNTUH
        |--------------------------------------------------------------------------
        */

        const response = await axios.post(

            "http://results.jntuh.ac.in/results/resultAction",

            formData.toString(),

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
            "JNTUH HTTP status:",
            response.status
        );


        /*
        |--------------------------------------------------------------------------
        | PARSE HTML
        |--------------------------------------------------------------------------
        */

        const html = response.data;

        const $ = cheerio.load(html);


        /*
        |--------------------------------------------------------------------------
        | FIND STUDENT RESULT TABLE
        |--------------------------------------------------------------------------
        */

        const resultTable =
            findStudentResultTable($);


        if (!resultTable) {

            console.log(
                "No student result table found."
            );


            return res.json({

                success: false,

                message:
                    "Student result table was not found.",

                htno: htno

            });

        }


        /*
        |--------------------------------------------------------------------------
        | RESPONSE
        |--------------------------------------------------------------------------
        */

        const resultData = {

            success: true,

            htno: htno,

            table: resultTable

        };


        /*
        |--------------------------------------------------------------------------
        | SAVE TO CACHE
        |--------------------------------------------------------------------------
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
|--------------------------------------------------------------------------
| FIND STUDENT RESULT TABLE
|--------------------------------------------------------------------------
*/

function findStudentResultTable($) {

    let bestTable = null;

    let bestScore = -1;


    $("table").each(
        (index, table) => {

            const text =
                $(table)
                    .text()
                    .replace(/\s+/g, " ")
                    .trim();


            const lowerText =
                text.toLowerCase();


            /*
            |--------------------------------------------------------------------------
            | EXCLUDE UGC GRADE GUIDELINES TABLE
            |--------------------------------------------------------------------------
            */

            const isGradeGuidelinesTable =

                lowerText.includes(
                    "% of marks secured in a subject"
                )

                ||

                lowerText.includes(
                    "letter grade (ugc guide lines)"
                )

                ||

                lowerText.includes(
                    "grade points(g)"
                )

                ||

                lowerText.includes(
                    "greater than or equal to 90"
                );


            if (isGradeGuidelinesTable) {

                console.log(
                    "Skipping grade guidelines table"
                );

                return;

            }


            /*
            |--------------------------------------------------------------------------
            | EXTRACT ROWS
            |--------------------------------------------------------------------------
            */

            const rows = [];


            $(table)
                .find("tr")
                .each(
                    (rowIndex, row) => {

                        const cells = [];


                        $(row)
                            .find("th, td")
                            .each(
                                (cellIndex, cell) => {

                                    const value =
                                        $(cell)
                                            .text()
                                            .replace(
                                                /\s+/g,
                                                " "
                                            )
                                            .trim();


                                    if (value) {

                                        cells.push(value);

                                    }

                                }
                            );


                        if (cells.length > 0) {

                            rows.push(cells);

                        }

                    }
                );


            /*
            |--------------------------------------------------------------------------
            | IGNORE SMALL TABLES
            |--------------------------------------------------------------------------
            */

            if (rows.length < 2) {

                return;

            }


            /*
            |--------------------------------------------------------------------------
            | SCORE TABLE
            |--------------------------------------------------------------------------
            */

            let score = 0;


            /*
             * Student-result related keywords
             */

            const keywords = [

                "subject",

                "code",

                "grade",

                "credits",

                "credit",

                "marks",

                "internal",

                "external",

                "mid",

                "semester"

            ];


            for (
                const keyword of keywords
            ) {

                if (
                    lowerText.includes(keyword)
                ) {

                    score++;

                }

            }


            /*
            |--------------------------------------------------------------------------
            | SUBJECT TABLE GETS HIGHER SCORE
            |--------------------------------------------------------------------------
            */

            if (
                lowerText.includes("subject")
            ) {

                score += 5;

            }


            if (
                lowerText.includes("grade")
            ) {

                score += 2;

            }


            if (
                lowerText.includes("credits")
            ) {

                score += 2;

            }


            /*
            |--------------------------------------------------------------------------
            | KEEP BEST TABLE
            |--------------------------------------------------------------------------
            */

            if (score > bestScore) {

                bestScore = score;

                bestTable = rows;

            }

        }
    );


    return bestTable;

}


/*
|--------------------------------------------------------------------------
| SERVER
|--------------------------------------------------------------------------
*/

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `Server running on port ${PORT}`
        );

    }
);
