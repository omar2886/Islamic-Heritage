-- Tabla: cases
CREATE TABLE IF NOT EXISTS cases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    total_estate DECIMAL(15,2) NOT NULL,
    is_deceased_male BOOLEAN NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Tabla: heir_types
CREATE TABLE IF NOT EXISTS heir_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB;

-- Inserción de algunos tipos básicos (ajusta según necesites)
INSERT IGNORE INTO heir_types (name, description) VALUES
    ('esposo', 'Esposo sobreviviente'),
    ('esposa', 'Esposa sobreviviente'),
    ('hijo_varon', 'Hijo varón'),
    ('hija', 'Hija'),
    ('padre', 'Padre'),
    ('madre', 'Madre');

-- Tabla: heirs
CREATE TABLE IF NOT EXISTS heirs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    case_id INT NOT NULL,
    heir_type_id INT NOT NULL,
    count TINYINT UNSIGNED NOT NULL DEFAULT 1,
    parent_id INT DEFAULT NULL,
    divorce_status ENUM('ninguno','revocable','definitivo') DEFAULT 'ninguno',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (case_id),
    INDEX (heir_type_id),
    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
    FOREIGN KEY (heir_type_id) REFERENCES heir_types(id),
    FOREIGN KEY (parent_id) REFERENCES heirs(id)
) ENGINE=InnoDB;

-- Tabla: blockages
CREATE TABLE IF NOT EXISTS blockages (
    blocker_type_id INT NOT NULL,
    blocked_type_id INT NOT NULL,
    always_block TINYINT(1) NOT NULL DEFAULT 1,
    `condition` VARCHAR(255) DEFAULT NULL,
    PRIMARY KEY (blocker_type_id, blocked_type_id),
    FOREIGN KEY (blocker_type_id) REFERENCES heir_types(id),
    FOREIGN KEY (blocked_type_id) REFERENCES heir_types(id)
) ENGINE=InnoDB;

-- Tabla: distribution
CREATE TABLE IF NOT EXISTS distribution (
    id INT AUTO_INCREMENT PRIMARY KEY,
    case_id INT NOT NULL,
    heir_type_id INT NOT NULL,
    share_fraction DECIMAL(18,10) NOT NULL,
    share_amount DECIMAL(15,2) NOT NULL,
    adjustment_type ENUM('none', 'awl', 'radd') DEFAULT 'none',
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
    FOREIGN KEY (heir_type_id) REFERENCES heir_types(id)
) ENGINE=InnoDB;
