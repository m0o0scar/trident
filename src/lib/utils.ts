import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Sanitizes a branch name by replacing illegal Git branch name characters with "-".
 * Git branch names cannot contain:
 * - Space, ~, ^, :, ?, *, [, \, control characters
 * - Double dots (..)
 * - @{ sequence
 * - Leading/trailing dots or slashes
 * - Consecutive slashes
 */
export function sanitizeBranchName(name: string): string {
  let sanitized = name
    // Replace illegal characters with "-"
    .replace(/[\s~^:?*\[\]\\@{}<>|"'`!#$%&()+=;,]/g, '-')
    // Replace double dots with single dash
    .replace(/\.{2,}/g, '-')
    // Replace consecutive slashes with single slash
    .replace(/\/{2,}/g, '/')
    // Replace consecutive dashes with single dash
    .replace(/-{2,}/g, '-');
  
  return sanitized;
}
