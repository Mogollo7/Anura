-- Script para llenar la tabla user_preferences con valores por defecto fijos
-- para usuarios que ya existen y no tienen preferencias

INSERT INTO auth.user_preferences (
    user_id, 
    theme, 
    interface_mode, 
    accessibility_mode, 
    language, 
    notifications_enabled, 
    email_notifications, 
    push_notifications, 
    exact_location_enabled, 
    public_profile
)
SELECT 
    u.id,
    'light' AS theme,                    -- Tema claro por defecto (iNaturalist-like)
    'standard' AS interface_mode,         -- Modo estándar
    FALSE AS accessibility_mode,          -- Sin alto contraste
    'es' AS language,                     -- Español
    TRUE AS notifications_enabled,        -- Notificaciones habilitadas
    TRUE AS email_notifications,          -- Email notifications habilitadas
    TRUE AS push_notifications,           -- Push notifications habilitadas
    FALSE AS exact_location_enabled,      -- Ubicación exacta deshabilitada por defecto
    TRUE AS public_profile                -- Perfil público por defecto
FROM auth.users u
WHERE NOT EXISTS (
    SELECT 1 FROM auth.user_preferences up WHERE up.user_id = u.id
)
ON CONFLICT (user_id) DO NOTHING;

-- Mostrar resumen de lo que se insertó
SELECT 'Preferencias insertadas para ' || COUNT(*) || ' usuarios' as resultado
FROM auth.user_preferences;
