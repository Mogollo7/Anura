-- Seed script to create user preferences for existing users
-- Run this after the user_preferences table is created

INSERT INTO auth.user_preferences (user_id, theme, interface_mode, accessibility_mode, language, notifications_enabled, email_notifications, push_notifications, exact_location_enabled, public_profile)
SELECT 
    u.id,
    'dark' as theme,
    'standard' as interface_mode,
    FALSE as accessibility_mode,
    'es' as language,
    TRUE as notifications_enabled,
    TRUE as email_notifications,
    TRUE as push_notifications,
    FALSE as exact_location_enabled,
    TRUE as public_profile
FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;