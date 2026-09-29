class User {
  constructor(row) {
    this.id = row.id;
    this.username = row.username;
    this.email = row.email;
    this.password_hash = row.password_hash;
    this.auth_provider = row.auth_provider;
    this.google_id = row.google_id;
    this.profile_image = row.profile_image;
    this.biography = row.biography;
    this.role = row.role;
    this.is_verified = row.is_verified;
    this.is_active = row.is_active;
    this.allow_ai_training = row.allow_ai_training;
    this.created_at = row.created_at;
    this.updated_at = row.updated_at;
  }

  /** Nunca incluye password_hash ni google_id: lo que sale por la API. */
  toJSON() {
    return {
      id: this.id,
      username: this.username,
      email: this.email,
      auth_provider: this.auth_provider,
      profile_image: this.profile_image,
      biography: this.biography,
      role: this.role,
      is_verified: this.is_verified,
      is_active: this.is_active,
      allow_ai_training: this.allow_ai_training,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }

  /**
   * Lo único que una persona ajena (o sin sesión) puede ver de un perfil: nada de correo, proveedor
   * de acceso, estado de verificación ni preferencias. GET /api/auth/public/:username no exige token.
   */
  toPublicJSON() {
    return {
      id: this.id,
      username: this.username,
      profile_image: this.profile_image,
      biography: this.biography,
      role: this.role,
    };
  }
}

module.exports = User;
