-- ============================================================================
-- Proyecto: PreuSync
-- Descripción: Script de configuración de base de datos nacional (Multi-Tenancy).
-- Jerarquía: Provincias -> Municipios -> Escuelas -> Grupos.
-- Autor: JiroxDEV
-- Licensed under the GNU Affero General Public License v3
-- ============================================================================

-- 1. Tablas de Ubicación e Institución
CREATE TABLE IF NOT EXISTS provinces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS municipalities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    province_id UUID NOT NULL REFERENCES provinces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(province_id, name)
);

CREATE TABLE IF NOT EXISTS schools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    municipality_id UUID NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(municipality_id, name)
);

CREATE TABLE IF NOT EXISTS school_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- Ej: "11-2", "12-1"
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(school_id, name)
);

-- 2. Tabla de Responsabilidades (Para Docentes)
CREATE TABLE IF NOT EXISTS responsibilities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    category TEXT DEFAULT 'general' -- Ej: 'docencia', 'administracion', 'extracurricular'
);

-- 3. Actualización de Perfiles (Asegurar columnas Multi-Tenancy)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES school_groups(id) ON DELETE SET NULL;

-- 4. Datos Iniciales de Ejemplo (Opcional, para pruebas)
-- INSERT INTO provinces (name) VALUES ('La Habana'), ('Santiago de Cuba');
-- ...

-- 5. Índices para Optimización
CREATE INDEX IF NOT EXISTS idx_municipalities_province ON municipalities(province_id);
CREATE INDEX IF NOT EXISTS idx_schools_municipality ON schools(municipality_id);
CREATE INDEX IF NOT EXISTS idx_groups_school ON school_groups(school_id);
CREATE INDEX IF NOT EXISTS idx_profiles_school ON profiles(school_id);
