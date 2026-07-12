import express from "express"
import { rateLimiter } from "./rate-limiter.js";

const app = express();
app.use(express.json());

app.post("/", async (req, res) => {
    res.send('Hello');

    res.status(200).json({
        success: true,
        msg: "Home page api"
    })
})



app.post("/user", rateLimiter, async (req, res) => {
    res.send('Hello user');

    res.status(200).json({
        success: true,
        msg: "User page api"
    })
})



app.listen(3000, () => {
    console.log(`Server is listening on http://localhost:3000`)
})

