import express from "express";
import multer from "multer";
import Groq from "groq-sdk";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const app = express();

const storage = multer.diskStorage({

    destination: "uploads/",

    filename: (req, file, cb) => {

        const nombre =
            `audio-${Date.now()}.webm`;

        cb(null, nombre);
    }

});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 2 * 1024 * 1024
    }
});

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

app.use(express.static("."));


app.post("/procesar-voz", (req, res) => {

    upload.single("audio")(req, res, async (error) => {

        // ==========================================
        // ERROR DE MULTER
        // ==========================================

        if (error) {

            if (error instanceof multer.MulterError) {

                if (error.code === "LIMIT_FILE_SIZE") {

                    return res.status(413).json({
                        error: "El audio supera el tamaño máximo permitido de 2 MB."
                    });

                }

                return res.status(400).json({
                    error: `Error al subir el audio: ${error.message}`
                });
            }

            return res.status(500).json({
                error: error.message
            });
        }


        // ==========================================
        // PROCESAMIENTO NORMAL
        // ==========================================

        try {
            console.log(
                "Tamaño:",
                (req.file.size / 1024).toFixed(2),
                "KB"
            );

            // ==========================================
            // 1. TRANSCRIBIR
            // ==========================================

            const transcription =
                await groq.audio.transcriptions.create({
                    file: fs.createReadStream(
                        req.file.path
                    ),
                    model: "whisper-large-v3-turbo",
                    language: "es",
                    temperature: 0
                });

            const texto =
                transcription.text;


            console.log(
                "Transcripción:",
                texto
            );


            // ==========================================
            // 2. INTERPRETAR
            // ==========================================

            const completion =
                await groq.chat.completions.create({

                    model: "llama-3.1-8b-instant",

                    temperature: 0,

                    messages: [

                        {
                            role: "system",

                            content: `
Eres un asistente para un sistema de ventas.

Debes interpretar comandos escritos o hablados
relacionados con productos y cantidades.

Devuelve SIEMPRE un JSON válido.

Las acciones permitidas son:

- registrar_venta
- modificar_cantidad
- modificar_codigo
- eliminar_producto
- desconocida

Ejemplos:

"Registrar tres unidades del producto 50"

{
    "accion": "registrar_venta",
    "producto": 50,
    "cantidad": 3
}

"Cambia la cantidad a 5"

{
    "accion": "modificar_cantidad",
    "cantidad": 5
}

"Cambia el código a 20"

{
    "accion": "modificar_codigo",
    "codigo": 20
}

Si no puedes identificar la intención:

{
    "accion": "desconocida"
}

No agregues explicaciones.
Devuelve únicamente JSON.
`
                        },

                        {
                            role: "user",
                            content: texto
                        }

                    ],

                    response_format: {
                        type: "json_object"
                    }

                });


            const resultado =
                JSON.parse(
                    completion.choices[0].message.content
                );


            // ==========================================
            // 3. ELIMINAR AUDIO
            // ==========================================

            fs.unlinkSync(
                req.file.path
            );


            // ==========================================
            // 4. RESPUESTA
            // ==========================================

            res.json({

                texto: texto,

                resultado: resultado

            });


        } catch (error) {

            console.error(error);


            if (req.file) {

                try {

                    fs.unlinkSync(
                        req.file.path
                    );

                } catch {}

            }


            res.status(500).json({

                error: error.message

            });

        }

    });

});


app.listen(3000, () => {

    console.log(
        "Servidor ejecutándose en http://localhost:3000"
    );

});