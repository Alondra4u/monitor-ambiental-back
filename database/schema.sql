-- Esquema de la base de datos Monitor Ambiental.
-- MySQL/TiDB compatible. No contiene mediciones ni credenciales.
-- Selecciona primero la base de datos destino antes de ejecutar este archivo.

CREATE TABLE `zonas` (
  `id_zona` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `descripcion` text COLLATE utf8mb4_unicode_ci,
  `tipo` enum('URBANA','RURAL') COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id_zona`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `dispositivos` (
  `id_dispositivo` int NOT NULL AUTO_INCREMENT,
  `id_zona` int NOT NULL,
  `nombre` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `codigo` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `estatus` enum('ACTIVO','INACTIVO','MANTENIMIENTO') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVO',
  `notas` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id_dispositivo`),
  KEY `idx_dispositivos_zona` (`id_zona`),
  CONSTRAINT `fk_dispositivos_zona` FOREIGN KEY (`id_zona`)
    REFERENCES `zonas` (`id_zona`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `mediciones` (
  `id_medicion` int NOT NULL AUTO_INCREMENT,
  `id_dispositivo` int NOT NULL,
  `fecha_medicion` date NOT NULL,
  `hora_medicion` time NOT NULL,
  `temperatura` decimal(5,2) DEFAULT NULL,
  `humedad` decimal(5,2) DEFAULT NULL,
  `co2_ppm` decimal(10,2) DEFAULT NULL,
  `co_ppm` decimal(10,2) DEFAULT NULL,
  `voc_ppb` decimal(10,2) DEFAULT NULL,
  `nox_ppb` decimal(10,2) DEFAULT NULL,
  PRIMARY KEY (`id_medicion`),
  KEY `idx_mediciones_dispositivo_fecha_hora` (`id_dispositivo`,`fecha_medicion`,`hora_medicion`),
  CONSTRAINT `fk_mediciones_dispositivo` FOREIGN KEY (`id_dispositivo`)
    REFERENCES `dispositivos` (`id_dispositivo`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `configuraciones_alarmas` (
  `id_config_alarma` int NOT NULL AUTO_INCREMENT,
  `id_dispositivo` int DEFAULT NULL,
  `nombre_variable` enum('temperatura','humedad','co2','co','voc','nox') COLLATE utf8mb4_unicode_ci NOT NULL,
  `valor_minimo` decimal(10,2) DEFAULT NULL,
  `valor_maximo` decimal(10,2) DEFAULT NULL,
  `nivel_severidad` tinyint NOT NULL DEFAULT '1',
  `esta_activa` tinyint(1) NOT NULL DEFAULT '1',
  `fecha_creacion` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_config_alarma`),
  KEY `idx_config_alarmas_dispositivo` (`id_dispositivo`),
  CONSTRAINT `fk_config_alarmas_dispositivo` FOREIGN KEY (`id_dispositivo`)
    REFERENCES `dispositivos` (`id_dispositivo`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `eventos_alarma` (
  `id_evento_alarma` int NOT NULL AUTO_INCREMENT,
  `id_config_alarma` int NOT NULL,
  `id_medicion` int NOT NULL,
  `id_dispositivo` int NOT NULL,
  `nombre_variable` enum('temperatura','humedad','co2','co','voc','nox') COLLATE utf8mb4_unicode_ci NOT NULL,
  `valor` decimal(10,2) NOT NULL,
  `fecha_disparo` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `estatus` enum('ACTIVA','RESUELTA') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVA',
  PRIMARY KEY (`id_evento_alarma`),
  KEY `idx_eventos_configuracion` (`id_config_alarma`),
  KEY `idx_eventos_medicion` (`id_medicion`),
  KEY `idx_eventos_dispositivo` (`id_dispositivo`),
  CONSTRAINT `fk_eventos_configuracion` FOREIGN KEY (`id_config_alarma`)
    REFERENCES `configuraciones_alarmas` (`id_config_alarma`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_eventos_medicion` FOREIGN KEY (`id_medicion`)
    REFERENCES `mediciones` (`id_medicion`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_eventos_dispositivo` FOREIGN KEY (`id_dispositivo`)
    REFERENCES `dispositivos` (`id_dispositivo`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
