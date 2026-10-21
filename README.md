# English with Teacher Celia: archivo web

Sitio estático con las publicaciones de la comunidad de WhatsApp "English with Teacher Celia" (Celia Jiménez), publicado con autorización de la autora.

- `index.html`, `style.css`, `app.js`: la página.
- `data/posts.json`: las fichas (una por línea). Se editan desde el panel.
- `admin/`: panel con usuario y contraseña para agregar, editar y eliminar fichas.
- `data/admin-users.json`: usuarios del panel (la llave de GitHub va cifrada con la contraseña de cada uno).
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

## Panel de fichas

- Panel: `https://inudstris32iot.github.io/celia-english-web/admin/`
- Configuración de usuarios: `https://inudstris32iot.github.io/celia-english-web/admin/setup.html`

Cómo funciona: GitHub Pages no tiene servidor, así que el panel guarda los cambios directamente en este repositorio usando una llave de GitHub (fine-grained token con permiso *Contents: Read and write* solo sobre este repositorio). La llave se guarda cifrada con AES-256-GCM; la contraseña del usuario la descifra en su navegador al entrar. Cada guardado es un commit, así que todo cambio se puede revisar y deshacer desde el historial.

Créditos: el panel no deja guardar una imagen o video que no sea de Celia sin el nombre de su dueño, y pide confirmar que los créditos son correctos.

Si la llave vence: crea otra en GitHub y vuelve a guardar cada usuario en `setup.html` con su contraseña.

## Verla en tu computadora

```
python -m http.server 8765
```

y abre http://localhost:8765
