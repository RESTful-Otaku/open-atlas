#!/usr/bin/env bash
set -euo pipefail

# md-to-pdf — Convert markdown reports to PDF
# Usage: ./md-to-pdf.sh <input.md> [output.pdf]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

show_help() {
    cat <<EOF
Usage: ./md-to-pdf.sh <input.md> [output.pdf]

Convert a markdown file to PDF.

Arguments:
  input.md   Path to the markdown file (required)
  output.pdf Output path (default: input file with .pdf extension)

Examples:
  ./md-to-pdf.sh reports/my-report.md
  ./md-to-pdf.sh reports/my-report.md docs/report.pdf

Supported engines (auto-detected, first match wins):
  pandoc + wkhtmltopdf  (recommended — easiest install)
  pandoc + weasyprint   (best output quality)
  md-to-pdf             (npm)

Requirements:
  pandoc + weasyprint:  brew install pandoc weasyprint       (best quality)
  pandoc + wkhtmltopdf: brew install pandoc wkhtmltopdf      (easiest, recommended)
  md-to-pdf:            npm install -g md-to-pdf

Without any engine, the markdown is printed to stdout for terminal review.
EOF
}

INPUT="${1:-}"
OUTPUT="${2:-}"

if [ "$INPUT" = "--help" ] || [ "$INPUT" = "-h" ] || [ -z "$INPUT" ]; then
    show_help
    exit 0
fi

if [ ! -f "$INPUT" ]; then
    echo "❌ Input file not found: $INPUT"
    show_help
    exit 1
fi

if [ -z "$OUTPUT" ]; then
    OUTPUT="${INPUT%.md}.pdf"
fi

# Detect available engine
USE_PANDOC=false
USE_MDTOPDF=false

if command -v pandoc &>/dev/null; then
    if command -v weasyprint &>/dev/null || command -v wkhtmltopdf &>/dev/null; then
        USE_PANDOC=true
    fi
fi

if command -v md-to-pdf &>/dev/null; then
    USE_MDTOPDF=true
fi

convert_via_pandoc() {
    local input="$1" output="$2"
    local pdf_engine="weasyprint"
    if ! command -v weasyprint &>/dev/null; then
        pdf_engine="wkhtmltopdf"
    fi
    echo "🔄 Converting via pandoc + $pdf_engine ..."
    pandoc "$input" \
        --pdf-engine="$pdf_engine" \
        --metadata title="$(head -1 "$input" | sed 's/^# //')" \
        --from markdown \
        --to pdf \
        --output "$output"
    echo "✅ Created: $output"
}

convert_via_mdtopdf() {
    local input="$1" output="$2"
    echo "🔄 Converting via md-to-pdf ..."
    npx md-to-pdf "$input"
    local generated="${input%.md}.pdf"
    if [ "$generated" != "$output" ]; then
        mv "$generated" "$output"
    fi
    echo "✅ Created: $output"
}

if $USE_PANDOC; then
    convert_via_pandoc "$INPUT" "$OUTPUT"
elif $USE_MDTOPDF; then
    convert_via_mdtopdf "$INPUT" "$OUTPUT"
else
    echo "⚠️  No PDF engine found. Printing markdown to stdout:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    cat "$INPUT"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Install one of these for PDF conversion:"
    echo "  pandoc + wkhtmltopdf  — brew install pandoc wkhtmltopdf    (recommended)"
    echo "  pandoc + weasyprint   — brew install pandoc weasyprint     (best quality)"
    echo "  md-to-pdf             — npm install -g md-to-pdf"
    exit 1
fi
