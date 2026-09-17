-- ============================================================================
-- Proyecto: PreuSync
-- Descripción: Script de REESTABLECIMIENTO TOTAL AGRESIVO.
--              Limpia el esquema 'public' y borra usuarios de 'auth'.
-- Autor: JiroxDEV
-- Licensed under the GNU Affero General Public License v3
-- ============================================================================

-- 1. LIMPIEZA AGRESIVA DEL ESQUEMA PÚBLICO
-- Este bloque detecta y elimina todas las tablas existentes automáticamente.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
END $$;

-- 2. LIMPIEZA DE USUARIOS DE AUTENTICACIÓN (Supabase Auth)
-- ⚠️ Esto borrará todos los correos y contraseñas registrados en el sistema Auth.
-- Solo funciona si tienes permisos suficientes en el editor SQL.
DELETE FROM auth.users;

-- 3. RECONSTRUCCIÓN DEL ESQUEMA
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Jerarquía Nacional
CREATE TABLE provinces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE municipalities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    province_id UUID NOT NULL REFERENCES provinces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(province_id, name)
);

CREATE TABLE schools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    municipality_id UUID NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT,
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(municipality_id, name)
);

CREATE TABLE school_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- Ej: "11-2", "12-1"
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(school_id, name)
);

-- Perfiles y Roles
CREATE TABLE responsibilities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    category TEXT DEFAULT 'general'
);

CREATE TABLE profiles (
    id UUID PRIMARY KEY, -- Se vincula con auth.users.id
    username TEXT UNIQUE NOT NULL,
    first_name TEXT,
    last_name TEXT,
    full_name TEXT,
    id_card TEXT UNIQUE,
    role TEXT NOT NULL DEFAULT 'student',
    status TEXT DEFAULT 'verified',
    avatar_url TEXT,
    school_id UUID REFERENCES schools(id) ON DELETE SET NULL,
    group_id UUID REFERENCES school_groups(id) ON DELETE SET NULL,
    tutee TEXT,
    responsibilities TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Contenido
CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    details TEXT,
    image_url TEXT,
    likes_count BIGINT DEFAULT 0,
    dislikes_count BIGINT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    vote_type TEXT CHECK (vote_type IN ('up', 'down')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(post_id, user_id)
);

CREATE TABLE news (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    details TEXT,
    image_url TEXT,
    author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    is_featured BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Gestión
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    details TEXT,
    date TEXT NOT NULL,
    time TEXT,
    place TEXT,
    type TEXT NOT NULL,
    school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
    group_id UUID REFERENCES school_groups(id) ON DELETE CASCADE,
    shift INTEGER NOT NULL,
    day TEXT NOT NULL,
    subject TEXT NOT NULL,
    schedule_type TEXT DEFAULT 'Normal',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE ephemerides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    details TEXT,
    date TEXT NOT NULL, -- Formato DD/MM
    year TEXT,
    importance INTEGER DEFAULT 1,
    tags TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Soporte
CREATE TABLE bug_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    device_info TEXT,
    error_log TEXT,
    user_description TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE app_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version_code INTEGER UNIQUE NOT NULL,
    version_name TEXT NOT NULL,
    details TEXT,
    download_url TEXT,
    is_critical BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. ÍNDICES
CREATE INDEX idx_profiles_username ON profiles(username);
CREATE INDEX idx_profiles_school ON profiles(school_id);
CREATE INDEX idx_posts_author ON posts(author_id);
CREATE INDEX idx_events_school ON events(school_id);
CREATE INDEX idx_schedules_group ON schedules(group_id);
CREATE INDEX idx_ephemerides_date ON ephemerides(date);

-- 5. DATOS MAESTROS
INSERT INTO responsibilities (name, category) VALUES
('Director/a', 'administracion'),
('Subdirector/a Docente', 'administracion'),
('Jefe/a de Grado', 'docencia'),
('Guía de Grupo', 'docencia'),
('Profesor/a de Asignatura', 'docencia'),
('Secretario/a Docente', 'administracion');
