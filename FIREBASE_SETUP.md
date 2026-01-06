# 🔒 Configuración de Seguridad de Firebase

## Problema Actual

Si ves el error **"Error cargando gastos/ingresos: Acceso denegado"**, es porque las reglas de Firestore no están configuradas correctamente.

---

## Solución Rápida

### Opción 1: Usando Firebase CLI (Recomendado)

```bash
# 1. Instalar Firebase CLI si no lo tienes
npm install -g firebase-tools

# 2. Login en Firebase
firebase login

# 3. Inicializar proyecto (solo primera vez)
firebase init firestore
# Seleccionar: Use an existing project
# Elegir: investment-manager-e47b6
# Reglas: firestore.rules (ya existe)
# Índices: firestore.indexes.json (dejar default)

# 4. Deployar las reglas
firebase deploy --only firestore:rules
```

### Opción 2: Manualmente en Firebase Console

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Selecciona tu proyecto: **investment-manager-e47b6**
3. Ve a **Firestore Database** → **Reglas**
4. Copia y pega el contenido de `firestore.rules`:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Función helper para verificar autenticación
    function isAuthenticated() {
      return request.auth != null;
    }
    
    // Función para verificar si es un super admin
    function isSuperAdmin() {
      return request.auth != null && 
             (request.auth.uid == '9dZMQNvgovSWE4lP7tOUNDzy6Md2' || 
              request.auth.uid == 'T0Kh0eHZ05he8iqD6vEG2G2c7Rl2');
    }
    
    // Reglas para la aplicación HomeFlow
    match /artifacts/{appId}/public/data/{document=**} {
      // Solo super admins tienen acceso completo
      allow read, write: if isSuperAdmin();
    }
    
    // Denegar todo lo demás por defecto
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

5. Click en **Publicar**

---

## Verificar que Funciona

Después de configurar las reglas:

1. **Refrescar la aplicación** (F5)
2. **Login con tu usuario** (debe estar en SUPER_ADMINS)
3. Deberías ver el Dashboard cargando correctamente
4. Si sigue fallando, abre la **Consola del Navegador** (F12) y busca errores específicos

---

## Usuarios Autorizados

Según `src/config/constants.js`, estos son los usuarios con permisos:

```javascript
export const SUPER_ADMINS = [
  '9dZMQNvgovSWE4lP7tOUNDzy6Md2',  // Albert Carrasquel
  'T0Kh0eHZ05he8iqD6vEG2G2c7Rl2',  // Haydee Macias
];
```

**¿Cómo obtener tu UID?**

Si necesitas agregar otro usuario:
1. Crea el usuario en Firebase Authentication
2. Haz login en la app
3. Abre la consola del navegador (F12)
4. Ejecuta: `firebase.auth().currentUser.uid`
5. Copia el UID
6. Agrégalo a `SUPER_ADMINS` en `src/config/constants.js`
7. Agrégalo también a las reglas de Firestore

---

## Reglas Alternativas (Menos Restrictivas)

Si quieres permitir acceso a **cualquier usuario autenticado** (no solo super admins):

```javascript
match /artifacts/{appId}/public/data/{document=**} {
  // Permitir a cualquier usuario autenticado
  allow read, write: if isAuthenticated();
}
```

⚠️ **Advertencia**: Esto permite que cualquier persona con cuenta acceda a todos los datos.

---

## Troubleshooting

### Error: "permission-denied"
- ✅ **Solución**: Configurar las reglas de Firestore (ver arriba)
- ✅ Verificar que estás autenticado
- ✅ Verificar que tu UID está en SUPER_ADMINS

### Error: "unauthenticated"
- ✅ **Solución**: Hacer login primero
- ✅ Verificar credenciales en Firebase Authentication

### Error: "network error"
- ✅ Verificar conexión a Internet
- ✅ Verificar que el proyecto de Firebase existe
- ✅ Verificar que las credenciales en `src/config/firebase.js` son correctas

---

## Testing de Reglas

Puedes probar las reglas en Firebase Console:

1. Ve a **Firestore Database** → **Reglas**
2. Click en **Simulador de reglas**
3. Configura:
   - Tipo: `get`
   - Ubicación: `/artifacts/default-app-id/public/data/transactions/test123`
   - Auth: Selecciona un usuario autenticado
4. Click en **Ejecutar**
5. Debería decir: **✅ Permitido**

---

## Comandos Útiles

```bash
# Ver reglas actuales
firebase firestore:rules

# Deployar solo reglas (sin código)
firebase deploy --only firestore:rules

# Deployar todo (hosting + reglas)
firebase deploy
```

---

**Última actualización:** 6 de enero de 2026  
**Proyecto Firebase:** investment-manager-e47b6
