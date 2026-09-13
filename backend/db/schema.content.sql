-- Additive schema shared by SQLite and PostgreSQL. No payment tables changed.
CREATE TABLE IF NOT EXISTS media_deletions (
  media_path TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS creator_profiles (
  id TEXT PRIMARY KEY CHECK (id = 'joice'),
  name TEXT NOT NULL,
  username TEXT NOT NULL,
  bio TEXT NOT NULL,
  avatar_path TEXT,
  cover_path TEXT,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS vip_posts (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL DEFAULT 'joice' CHECK (creator_id = 'joice'),
  type TEXT NOT NULL CHECK (type IN ('image','video')),
  media_path TEXT NOT NULL,
  media_driver TEXT NOT NULL CHECK (media_driver IN ('local','supabase')),
  caption TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0,1)),
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
  -- HOME preview: opt-in per post. preview_image is a tiny blurred derivative,
  -- never the original media. Added by migration on databases created earlier.
  show_as_preview INTEGER NOT NULL DEFAULT 0,
  preview_image TEXT,
  -- Contagem exibida, definida pela criadora. As curtidas reais dos assinantes
  -- ficam em vip_post_likes e são somadas a este número na hora de mostrar.
  likes_count INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS vip_posts_feed_idx ON vip_posts(creator_id,published,archived,sort_order,created_at);
-- vip_posts_preview_idx is created by initDb, after the additive columns exist.
CREATE TABLE IF NOT EXISTS vip_content_settings (
  id TEXT PRIMARY KEY CHECK (id = 'joice'),
  source TEXT NOT NULL DEFAULT 'legacy' CHECK (source IN ('legacy','managed'))
);
CREATE TABLE IF NOT EXISTS vip_post_likes (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES vip_posts(id),
  order_id BIGINT NOT NULL REFERENCES orders(id),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(post_id,order_id)
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY,
  secret_version TEXT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_login_limits (
  id TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  resets_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS vip_uploads (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  media_path TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  received_bytes BIGINT NOT NULL DEFAULT 0,
  remote_bytes BIGINT NOT NULL DEFAULT 0,
  pending_chunk TEXT NOT NULL DEFAULT '',
  remote_url TEXT,
  complete INTEGER NOT NULL DEFAULT 0,
  expires_at BIGINT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Quem pode administrar. O `user_id` é o `auth.uid` do Supabase Auth; a conta
-- é criada à mão no painel do Supabase e a linha aqui é o que concede a role.
-- Não existe cadastro público: nada no projeto insere nesta tabela sozinho.
CREATE TABLE IF NOT EXISTS admin_users (
  user_id TEXT PRIMARY KEY,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
