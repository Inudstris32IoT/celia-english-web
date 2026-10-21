# English with Teacher Celia: archivo web

Sitio estático con las publicaciones de la comunidad de WhatsApp "English with Teacher Celia" (Celia Jiménez), publicado con autorización de la autora.

- `index.html`, `style.css`, `app.js`: la página.
- `data/posts.js`: publicaciones generadas desde el backup del chat (solo los mensajes de la profesora).
- `media/`: imágenes y videos originales. `thumbs/`: miniaturas.
- `creditos.csv`: autoría asignada a cada imagen (Celia Jiménez, tercero con su fuente, o meme).

## Publicar en GitHub Pages

1. Crea un repositorio público en GitHub, por ejemplo `english-with-teacher-celia`.
2. Desde esta carpeta:

   ```
   git init
   git add .
   git commit -m "Archivo web English with Teacher Celia"
   git branch -M main
   git remote add origin https://github.com/USUARIO/english-with-teacher-celia.git
   git push -u origin main
   ```

3. En el repositorio, ve a **Settings → Pages → Build and deployment**, elige **Deploy from a branch**, rama `main`, carpeta `/ (root)` y guarda.
4. En uno o dos minutos la web estará en `https://USUARIO.github.io/english-with-teacher-celia/`.

## Verla en tu computadora

```
python -m http.server 8765
```

y abre http://localhost:8765
