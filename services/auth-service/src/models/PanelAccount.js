class PanelAccount {
  constructor(row) {
    this.id = row.id;
    this.userId = row.user_id;
    this.name = row.name;
    this.email = row.email;
    this.isSuperAdmin = row.is_super;
    this.permissions = row.permissions;
    this.createdAt = row.created_at;
  }

  /** Misma forma que PanelAccount en admin/src/lib/auth/panel-accounts.ts. */
  toJSON() {
    return {
      id: this.id,
      // Lo usan observation-service y notification-service para firmar audit.log.
      userId: this.userId,
      name: this.name,
      email: this.email,
      isSuperAdmin: this.isSuperAdmin,
      permissions: this.permissions,
      createdAt: this.createdAt,
    };
  }
}

module.exports = PanelAccount;
