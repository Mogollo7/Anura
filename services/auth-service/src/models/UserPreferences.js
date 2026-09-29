class UserPreferences {
  constructor(row) {
    this.id = row.id;
    this.user_id = row.user_id;
    this.theme = row.theme;
    this.interface_mode = row.interface_mode;
    this.accessibility_mode = row.accessibility_mode;
    this.language = row.language;
    this.notifications_enabled = row.notifications_enabled;
    this.email_notifications = row.email_notifications;
    this.push_notifications = row.push_notifications;
    this.exact_location_enabled = row.exact_location_enabled;
    this.public_profile = row.public_profile;
    this.preferences_completed = row.preferences_completed;
    this.created_at = row.created_at;
  }

  toJSON() {
    return { ...this };
  }
}

module.exports = UserPreferences;
