# Despliegue en hosting compartido

Sigue estos pasos para subir únicamente el contenido público al docroot del hosting compartido:

1. Genera el paquete listo para publicar:
   ```bash
   python3 scripts/make_public_zip.py --public public --out public.zip
   ```
2. Sube **solo** el contenido de `public.zip` al docroot (por ejemplo, descomprime todo dentro de `public_html`).
3. Verifica que las rutas funcionen correctamente:
   - `/?page=builder`
   - `/?page=results`
   - `/api/calc.php`
   - `/api/roles.php`
4. Advertencia: si existe `public/tools`, no subas el repositorio completo ni ninguna carpeta extra; solo publica el contenido del ZIP generado.
