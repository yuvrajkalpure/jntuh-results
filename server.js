const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

const JNTUH_URL =
    "http://results.jntuh.ac.in/results/resultAction";


app.get("/api/result", async (req, res) => {

    try {

        const htno = req.query.htno
            ?.trim()
            .toUpperCase();


        if (!htno) {

            return res.status(400).json({
                success: false,
                message: "HTNO is required"
            });

        }


        console.log(
            "Searching JNTUH result:",
            htno
        );


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

            JNTUH_URL,

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


        /*
         * Parse HTML
         */

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


        /*
         * Send result to frontend
         */

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
