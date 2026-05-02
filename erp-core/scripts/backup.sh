#!/bin/bash
# ERP Core Backup & Restore Script
# Usage: ./scripts/backup.sh [backup|restore|list] [options]

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/root/erp-core/backups}"
DATA_DIR="${DATA_DIR:-/root/erp-core/erp-core/data}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="erp-backup-${TIMESTAMP}"

mkdir -p "${BACKUP_DIR}"

backup() {
    local backup_path="${BACKUP_DIR}/${BACKUP_NAME}"
    mkdir -p "${backup_path}"

    echo "[Backup] Starting backup to ${backup_path}..."

    if [ -d "${DATA_DIR}" ]; then
        for db in "${DATA_DIR}"/*.db; do
            if [ -f "${db}" ]; then
                local db_name
                db_name=$(basename "${db}")
                echo "[Backup] Backing up database: ${db_name}"
                sqlite3 "${db}" ".backup '${backup_path}/${db_name}'"
            fi
        done
    fi

    if [ -f "/root/erp-core/erp-core/docker-compose.yml" ]; then
        cp "/root/erp-core/erp-core/docker-compose.yml" "${backup_path}/docker-compose.yml"
    fi

    if [ -f "/root/erp-core/erp-core/.env" ]; then
        cp "/root/erp-core/erp-core/.env" "${backup_path}/.env"
    fi

    echo "[Backup] Creating archive..."
    cd "${BACKUP_DIR}"
    tar -czf "${BACKUP_NAME}.tar.gz" "${BACKUP_NAME}"
    rm -rf "${backup_path}"

    echo "[Backup] Cleaning backups older than ${RETENTION_DAYS} days..."
    find "${BACKUP_DIR}" -name "erp-backup-*.tar.gz" -type f -mtime "+${RETENTION_DAYS}" -delete

    echo "[Backup] Complete: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
    ls -lh "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
}

restore() {
    local restore_file="${1:-}"
    if [ -z "${restore_file}" ]; then
        echo "[Error] Specify backup file to restore"
        echo "Usage: $0 restore <backup-file>"
        echo "Available backups:"
        list
        exit 1
    fi

    if [ ! -f "${restore_file}" ]; then
        echo "[Error] Backup file not found: ${restore_file}"
        exit 1
    fi

    echo "[Restore] Restoring from ${restore_file}..."
    local restore_path="${BACKUP_DIR}/restore_${TIMESTAMP}"
    mkdir -p "${restore_path}"

    tar -xzf "${restore_file}" -C "${restore_path}"

    local extracted_dir
    extracted_dir=$(find "${restore_path}" -maxdepth 1 -type d | tail -1)

    if [ -z "${extracted_dir}" ] || [ "${extracted_dir}" = "${restore_path}" ]; then
        echo "[Error] No backup data found in archive"
        rm -rf "${restore_path}"
        exit 1
    fi

    echo "[Restore] Stopping services..."
    cd /root/erp-core/erp-core
    docker compose stop erp-core knowledge-base task-manager 2>/dev/null || true

    for db_file in "${extracted_dir}"/*.db; do
        if [ -f "${db_file}" ]; then
            local db_name
            db_name=$(basename "${db_file}")
            echo "[Restore] Restoring database: ${db_name}"
            cp "${db_file}" "${DATA_DIR}/${db_name}"
        fi
    done

    if [ -f "${extracted_dir}/docker-compose.yml" ]; then
        cp "${extracted_dir}/docker-compose.yml" "/root/erp-core/erp-core/docker-compose.yml"
    fi

    echo "[Restore] Starting services..."
    cd /root/erp-core/erp-core
    docker compose start erp-core knowledge-base task-manager 2>/dev/null || true

    rm -rf "${restore_path}"
    echo "[Restore] Complete! Services restarted."
}

list() {
    echo "[Backups] Available backups:"
    if [ -d "${BACKUP_DIR}" ]; then
        find "${BACKUP_DIR}" -name "erp-backup-*.tar.gz" -type f -exec ls -lh {} \; 2>/dev/null || echo "  No backups found."
    else
        echo "  No backups directory found."
    fi
}

case "${1:-backup}" in
    backup)
        backup
        ;;
    restore)
        restore "${2:-}"
        ;;
    list)
        list
        ;;
    *)
        echo "Usage: $0 [backup|restore|list]"
        echo "  backup              Create a new backup (default)"
        echo "  restore <file>      Restore from a backup file"
        echo "  list                List available backups"
        exit 1
        ;;
esac
