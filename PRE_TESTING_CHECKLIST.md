# ✅ Checklist Pre-Testing - HomeFlow

**Fecha:** 7 de enero de 2026  
**Objetivo:** Preparar el entorno para testing con Haydee antes de prod  
**Rama actual:** `main`

---

## 🔥 **CRÍTICO - Hacer ANTES de empezar testing**

### 1. ⚙️ Configurar Reglas de Firestore en Producción

**Problema:** Las reglas de seguridad solo existen localmente, no están desplegadas en Firebase.

**Solución:**
```bash
# En tu terminal (carpeta del proyecto)
cd /home/albert/Documentos/investment-manager

# Verificar que estás logueado en Firebase
firebase login

# Desplegar SOLO las reglas (sin tocar hosting aún)
firebase deploy --only firestore:rules
```

**Verificación:**
- [ ] Ve a [Firebase Console](https://console.firebase.google.com/project/investment-manager-e47b6/firestore/rules)
- [ ] Verifica que las reglas incluyen los 2 UIDs (Albert y Haydee)
- [ ] Las reglas deben tener la función `isSuperAdmin()` con ambos UIDs

---

### 2. 👥 Crear Usuario de Haydee en Firebase Authentication

**Problema:** Haydee no puede hacer login si su usuario no existe.

**Solución:**

**Opción A - Tú creas el usuario (Recomendado):**
1. Ve a [Firebase Console > Authentication](https://console.firebase.google.com/project/investment-manager-e47b6/authentication/users)
2. Click en "Agregar usuario"
3. Email: `[email de Haydee]`
4. Contraseña: `[contraseña temporal segura]`
5. Copiar el UID generado
6. Verificar que el UID coincide con: `T0Kh0eHZ05he8iqD6vEG2G2c7Rl2`
   - ⚠️ Si no coincide, actualizar `src/config/constants.js` con el UID real

**Opción B - Haydee se registra (más complejo):**
1. Necesitas implementar pantalla de registro (no existe actualmente)
2. Después agregar su UID a SUPER_ADMINS
3. ❌ NO recomendado para testing MVP

**Verificación:**
- [ ] Usuario de Haydee existe en Firebase Authentication
- [ ] UID de Haydee está en `SUPER_ADMINS` en `src/config/constants.js`
- [ ] UID de Haydee está en reglas de Firestore

---

### 3. 🚀 Desplegar Aplicación a Firebase Hosting

**Problema:** Actualmente solo funciona en tu `localhost`. Haydee necesita una URL para acceder.

**Solución:**
```bash
# Generar build de producción
npm run build

# Desplegar a Firebase Hosting
firebase deploy --only hosting
```

**Resultado esperado:**
```
✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/investment-manager-e47b6/overview
Hosting URL: https://investment-manager-e47b6.web.app
```

**Verificación:**
- [ ] Abrir la URL de Hosting en navegador incógnito
- [ ] Verificar que carga la pantalla de login
- [ ] NO hacer login todavía (esperar a testing completo)

---

### 4. 📝 Enviar Credenciales a Haydee

**Problema:** Haydee necesita saber cómo acceder y con qué credenciales.

**Solución:**

Crear mensaje para Haydee con:
```
Hola Haydee,

Ya está lista la versión de testing de HomeFlow. Aquí están los datos:

🌐 URL: https://investment-manager-e47b6.web.app

🔐 Credenciales:
Email: [email de Haydee]
Contraseña: [contraseña temporal]

📋 Checklist de Testing:
https://github.com/albert-carrasquel/home-flow/blob/main/TESTING.md

⚠️ IMPORTANTE:
- Esta es una versión de prueba
- Los datos que ingreses son REALES (se guardan en Firestore)
- Si encuentras algún error, anótalo en una lista
- Cualquier duda, pregúntame

Por favor, revisa especialmente:
1. Login y logout
2. Dashboard (que cargue sin errores)
3. Agregar 1 inversión de prueba
4. Agregar 1 gasto de prueba
5. Reportes y exportación a Excel

¡Gracias por ayudarme a testear! 🚀
```

**Verificación:**
- [ ] Credenciales enviadas a Haydee
- [ ] URL compartida
- [ ] Link al TESTING.md compartido

---

### 5. 🔄 Crear Backup Antes de Testing

**Problema:** Durante testing puede haber errores que corrompan datos.

**Solución:**

**Opción A - Exportar datos existentes (si ya tienes datos):**
```bash
# Instalar herramienta de backup
npm install -g node-firestore-backup-restore

# Exportar (requiere service account key)
firestore-backup-restore --backup --output backup-pre-testing.json
```

**Opción B - Empezar con base de datos limpia:**
- [ ] Ir a Firebase Console > Firestore Database
- [ ] Si hay datos de prueba anteriores, puedes eliminarlos
- [ ] O dejarlos como están (Albert decide)

**Verificación:**
- [ ] Decisión tomada: ¿Empezar limpio o con datos existentes?
- [ ] Si hay datos importantes, hacer backup manual

---

### 6. ✅ Verificación Final Pre-Testing

Antes de invitar a Haydee, verifica:

**Checklist técnico:**
- [ ] `firebase deploy --only firestore:rules` ejecutado exitosamente
- [ ] `firebase deploy --only hosting` ejecutado exitosamente
- [ ] URL de hosting funciona en navegador incógnito
- [ ] Pantalla de login se muestra correctamente
- [ ] No hay errores en consola del navegador (F12)

**Checklist de usuarios:**
- [ ] Usuario Albert existe en Firebase Auth
- [ ] Usuario Haydee existe en Firebase Auth
- [ ] Ambos UIDs están en `SUPER_ADMINS`
- [ ] Ambos UIDs están en reglas de Firestore

**Checklist de documentación:**
- [ ] TESTING.md actualizado con cualquier detalle adicional
- [ ] Credenciales de Haydee preparadas
- [ ] Canal de comunicación definido (WhatsApp, email, etc.)

---

## 🎯 **Resumen de Comandos**

```bash
# 1. Desplegar reglas de seguridad
firebase deploy --only firestore:rules

# 2. Generar build
npm run build

# 3. Desplegar aplicación
firebase deploy --only hosting

# 4. Ver logs en tiempo real (durante testing)
firebase functions:log --only hosting
```

---

## 🐛 **Plan de Contingencia**

Si algo falla durante testing:

1. **Error de autenticación:**
   - Verificar que el UID está en SUPER_ADMINS
   - Verificar reglas de Firestore en Firebase Console

2. **Error "permission-denied":**
   - Re-desplegar reglas: `firebase deploy --only firestore:rules`
   - Verificar que el usuario está autenticado

3. **Aplicación no carga:**
   - Verificar que el build se generó: `ls -la dist/`
   - Re-desplegar hosting: `firebase deploy --only hosting`

4. **Datos no se guardan:**
   - Abrir consola del navegador (F12)
   - Buscar errores de Firestore
   - Verificar conexión a Internet

---

## 📊 **Estimación de Tiempo**

| Tarea | Tiempo estimado |
|-------|----------------|
| 1. Desplegar reglas | 2 minutos |
| 2. Crear usuario Haydee | 3 minutos |
| 3. Build + Deploy | 5 minutos |
| 4. Enviar credenciales | 5 minutos |
| 5. Backup (opcional) | 10 minutos |
| 6. Verificación final | 5 minutos |
| **TOTAL** | **~30 minutos** |

---

## ✅ **Checklist Final**

Marca cuando esté completo:

- [ ] **Paso 1:** Reglas de Firestore desplegadas ✅
- [ ] **Paso 2:** Usuario Haydee creado ✅
- [ ] **Paso 3:** Aplicación desplegada en Hosting ✅
- [ ] **Paso 4:** Credenciales enviadas a Haydee ✅
- [ ] **Paso 5:** Backup creado (si necesario) ✅
- [ ] **Paso 6:** Verificación final completada ✅

**Cuando todo esté ✅, puedes iniciar el testing con Haydee.**

---

**Fecha de completado:** _______________  
**Hosting URL:** _______________  
**Estado:** 🟡 EN PREPARACIÓN → 🟢 LISTO PARA TESTING
