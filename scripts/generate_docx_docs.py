"""
PetroView Documentation Generator
Converts Markdown docs to stylized Microsoft Word (.docx) documents.
"""

import os
import re
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

DOCS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'docs')

# Styling Colors
COLOR_PRIMARY = RGBColor(30, 58, 138)     # Navy #1E3A8A
COLOR_SECONDARY = RGBColor(14, 116, 144)  # Cyan #0E7490
COLOR_TEXT = RGBColor(30, 41, 59)         # Slate-800 #1E293B
COLOR_MUTED = RGBColor(100, 116, 139)     # Slate-500 #64748B
COLOR_BG_HEADER = "1E3A8A"                # Table Header BG
COLOR_BG_ALT = "F8FAFC"                   # Light Slate BG
COLOR_BORDER = "CBD5E1"                   # Slate-300

def set_cell_background(cell, hex_color):
    shading_elm = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>')
    cell._tc.get_or_add_tcPr().append(shading_elm)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def set_table_borders(table):
    tblPr = table._tbl.tblPr
    borders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>'
        f'  <w:top w:val="single" w:sz="4" w:space="0" w:color="{COLOR_BORDER}"/>'
        f'  <w:bottom w:val="single" w:sz="6" w:space="0" w:color="{COLOR_BORDER}"/>'
        f'  <w:insideH w:val="single" w:sz="4" w:space="0" w:color="{COLOR_BORDER}"/>'
        f'  <w:insideV w:val="none"/>'
        f'  <w:left w:val="none"/>'
        f'  <w:right w:val="none"/>'
        f'</w:tblBorders>'
    )
    tblPr.append(borders)

def parse_markdown_to_docx(md_text, doc):
    lines = md_text.split('\n')
    i = 0
    in_code_block = False
    code_lines = []
    
    while i < len(lines):
        line = lines[i]
        
        # Code block toggle
        if line.strip().startswith('```'):
            if in_code_block:
                # Flush code block
                code_text = '\n'.join(code_lines)
                tbl = doc.add_table(rows=1, cols=1)
                tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
                cell = tbl.cell(0, 0)
                set_cell_background(cell, "0F172A")
                set_cell_margins(cell, top=120, bottom=120, left=200, right=200)
                p = cell.paragraphs[0]
                p.paragraph_format.space_before = Pt(4)
                p.paragraph_format.space_after = Pt(4)
                run = p.add_run(code_text)
                run.font.name = 'Consolas'
                run.font.size = Pt(8.5)
                run.font.color.rgb = RGBColor(226, 232, 240)
                doc.add_paragraph() # Spacing
                in_code_block = False
                code_lines = []
            else:
                in_code_block = True
                code_lines = []
            i += 1
            continue
            
        if in_code_block:
            code_lines.append(line)
            i += 1
            continue

        stripped = line.strip()
        
        # Empty line
        if not stripped:
            i += 1
            continue
            
        # Horizontal rule
        if stripped in ['---', '***', '___']:
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(6)
            p.paragraph_format.space_after = Pt(6)
            run = p.add_run('_______________________________________________________________________________')
            run.font.color.rgb = RGBColor(203, 213, 225)
            run.font.size = Pt(6)
            i += 1
            continue
            
        # Headers
        if stripped.startswith('# '):
            h = doc.add_heading(level=1)
            h.paragraph_format.space_before = Pt(18)
            h.paragraph_format.space_after = Pt(6)
            run = h.add_run(stripped[2:])
            run.font.name = 'Segoe UI'
            run.font.size = Pt(20)
            run.font.bold = True
            run.font.color.rgb = COLOR_PRIMARY
            i += 1
            continue
            
        if stripped.startswith('## '):
            h = doc.add_heading(level=2)
            h.paragraph_format.space_before = Pt(14)
            h.paragraph_format.space_after = Pt(4)
            run = h.add_run(stripped[3:])
            run.font.name = 'Segoe UI'
            run.font.size = Pt(14)
            run.font.bold = True
            run.font.color.rgb = COLOR_PRIMARY
            i += 1
            continue
            
        if stripped.startswith('### '):
            h = doc.add_heading(level=3)
            h.paragraph_format.space_before = Pt(10)
            h.paragraph_format.space_after = Pt(3)
            run = h.add_run(stripped[4:])
            run.font.name = 'Segoe UI'
            run.font.size = Pt(11.5)
            run.font.bold = True
            run.font.color.rgb = COLOR_SECONDARY
            i += 1
            continue
            
        if stripped.startswith('#### '):
            h = doc.add_heading(level=4)
            h.paragraph_format.space_before = Pt(8)
            h.paragraph_format.space_after = Pt(2)
            run = h.add_run(stripped[5:])
            run.font.name = 'Segoe UI'
            run.font.size = Pt(10.5)
            run.font.bold = True
            run.font.color.rgb = COLOR_TEXT
            i += 1
            continue
            
        # Table parsing
        if stripped.startswith('|') and stripped.endswith('|'):
            table_lines = []
            while i < len(lines) and lines[i].strip().startswith('|') and lines[i].strip().endswith('|'):
                table_lines.append(lines[i].strip())
                i += 1
                
            if len(table_lines) >= 2:
                # Parse headers & rows
                raw_headers = [c.strip() for c in table_lines[0].split('|')[1:-1]]
                # Skip separator line if present (e.g. |---|---|)
                data_start_idx = 1
                if len(table_lines) > 1 and re.match(r'^[|\s\-:]+$', table_lines[1]):
                    data_start_idx = 2
                    
                rows_data = []
                for tline in table_lines[data_start_idx:]:
                    cols = [c.strip() for c in tline.split('|')[1:-1]]
                    rows_data.append(cols)
                    
                num_cols = len(raw_headers)
                tbl = doc.add_table(rows=len(rows_data) + 1, cols=num_cols)
                tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
                set_table_borders(tbl)
                
                # Header row
                hdr_row = tbl.rows[0]
                for c_idx, h_text in enumerate(raw_headers):
                    cell = hdr_row.cells[c_idx]
                    set_cell_background(cell, COLOR_BG_HEADER)
                    set_cell_margins(cell, top=120, bottom=120, left=120, right=120)
                    p = cell.paragraphs[0]
                    p.paragraph_format.space_before = Pt(2)
                    p.paragraph_format.space_after = Pt(2)
                    run = p.add_run(h_text.replace('**', ''))
                    run.font.name = 'Segoe UI'
                    run.font.size = Pt(9.5)
                    run.font.bold = True
                    run.font.color.rgb = RGBColor(255, 255, 255)
                    
                # Data rows
                for r_idx, r_data in enumerate(rows_data):
                    row = tbl.rows[r_idx + 1]
                    bg = COLOR_BG_ALT if r_idx % 2 == 1 else "FFFFFF"
                    for c_idx in range(num_cols):
                        cell = row.cells[c_idx]
                        set_cell_background(cell, bg)
                        set_cell_margins(cell, top=80, bottom=80, left=100, right=100)
                        p = cell.paragraphs[0]
                        p.paragraph_format.space_before = Pt(2)
                        p.paragraph_format.space_after = Pt(2)
                        val = r_data[c_idx] if c_idx < len(r_data) else ""
                        
                        # Format bold/code in cells
                        parts = re.split(r'(`[^`]+`|\*\*[^*]+\*\*)', val)
                        for part in parts:
                            if part.startswith('`') and part.endswith('`'):
                                run = p.add_run(part[1:-1])
                                run.font.name = 'Consolas'
                                run.font.size = Pt(8.5)
                                run.font.color.rgb = RGBColor(180, 83, 9)
                            elif part.startswith('**') and part.endswith('**'):
                                run = p.add_run(part[2:-2])
                                run.font.name = 'Segoe UI'
                                run.font.size = Pt(9)
                                run.font.bold = True
                                run.font.color.rgb = COLOR_TEXT
                            else:
                                run = p.add_run(part)
                                run.font.name = 'Segoe UI'
                                run.font.size = Pt(9)
                                run.font.color.rgb = COLOR_TEXT
                                
                doc.add_paragraph() # Spacing
            continue

        # Bullet List Item
        if stripped.startswith('- ') or stripped.startswith('* '):
            p = doc.add_paragraph(style='List Bullet')
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            content = stripped[2:]
            add_formatted_text(p, content)
            i += 1
            continue

        # Numbered List Item
        num_match = re.match(r'^(\d+)\.\s+(.*)$', stripped)
        if num_match:
            p = doc.add_paragraph(style='List Number')
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            add_formatted_text(p, num_match.group(2))
            i += 1
            continue

        # Normal Paragraph
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(3)
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.line_spacing = 1.15
        add_formatted_text(p, stripped)
        i += 1

def add_formatted_text(paragraph, text):
    parts = re.split(r'(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\([^)]+\))', text)
    for part in parts:
        if not part:
            continue
        if part.startswith('**') and part.endswith('**'):
            run = paragraph.add_run(part[2:-2])
            run.font.name = 'Segoe UI'
            run.font.size = Pt(10)
            run.font.bold = True
            run.font.color.rgb = COLOR_TEXT
        elif part.startswith('`') and part.endswith('`'):
            run = paragraph.add_run(part[1:-1])
            run.font.name = 'Consolas'
            run.font.size = Pt(9)
            run.font.color.rgb = RGBColor(194, 65, 12) # Amber
        elif part.startswith('*') and part.endswith('*'):
            run = paragraph.add_run(part[1:-1])
            run.font.name = 'Segoe UI'
            run.font.size = Pt(10)
            run.font.italic = True
            run.font.color.rgb = COLOR_TEXT
        else:
            run = paragraph.add_run(part)
            run.font.name = 'Segoe UI'
            run.font.size = Pt(10)
            run.font.color.rgb = COLOR_TEXT

def create_document_from_md(md_path, docx_path, title_header):
    with open(md_path, 'r', encoding='utf-8') as f:
        md_content = f.read()

    doc = Document()
    
    # Page setup - Standard Letter, 0.8 in margins
    for section in doc.sections:
        section.top_margin = Inches(0.8)
        section.bottom_margin = Inches(0.8)
        section.left_margin = Inches(0.8)
        section.right_margin = Inches(0.8)
        
        # Header / Footer
        header = section.header
        hp = header.paragraphs[0]
        hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        hrun = hp.add_run(f"PetroView Forecourt OS — {title_header}")
        hrun.font.name = 'Segoe UI'
        hrun.font.size = Pt(8.5)
        hrun.font.color.rgb = COLOR_MUTED
        
        footer = section.footer
        fp = footer.paragraphs[0]
        fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        frun = fp.add_run("Confidential & Proprietary — PetroView Technologies Ltd")
        frun.font.name = 'Segoe UI'
        frun.font.size = Pt(8.5)
        frun.font.color.rgb = COLOR_MUTED

    parse_markdown_to_docx(md_content, doc)
    doc.save(docx_path)
    print(f"Generated: {docx_path}")

def generate_all_docs():
    files = [
        ("01_PRODUCT_REQUIREMENTS_DOCUMENT.md", "01_PRODUCT_REQUIREMENTS_DOCUMENT.docx", "Product Requirements Document"),
        ("02_SYSTEM_ARCHITECTURE_DESIGN.md", "02_SYSTEM_ARCHITECTURE_DESIGN.docx", "System Architecture Design"),
        ("03_DATA_MODELS_AND_SCHEMA_DICTIONARY.md", "03_DATA_MODELS_AND_SCHEMA_DICTIONARY.docx", "Data Models & Schema Dictionary"),
        ("04_OPERATIONS_AND_DEPLOYMENT_GUIDE.md", "04_OPERATIONS_AND_DEPLOYMENT_GUIDE.docx", "Operations & Deployment Guide"),
        ("05_USER_MANUAL_AND_STANDARD_OPERATING_PROCEDURES.md", "05_USER_MANUAL_AND_STANDARD_OPERATING_PROCEDURES.docx", "User Manual & Standard Operating Procedures"),
    ]

    for md_file, docx_file, title in files:
        md_full = os.path.join(DOCS_DIR, md_file)
        docx_full = os.path.join(DOCS_DIR, docx_file)
        if os.path.exists(md_full):
            create_document_from_md(md_full, docx_full, title)

    # Now create the Combined Master Manual
    master_docx = os.path.join(DOCS_DIR, "PETROVIEW_COMPLETE_MASTER_DOCUMENTATION.docx")
    master_doc = Document()
    
    for section in master_doc.sections:
        section.top_margin = Inches(0.8)
        section.bottom_margin = Inches(0.8)
        section.left_margin = Inches(0.8)
        section.right_margin = Inches(0.8)
        
        header = section.header
        hp = header.paragraphs[0]
        hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        hrun = hp.add_run("PetroView Forecourt OS — Master Technical & Operational Specification")
        hrun.font.name = 'Segoe UI'
        hrun.font.size = Pt(8.5)
        hrun.font.color.rgb = COLOR_MUTED

        footer = section.footer
        fp = footer.paragraphs[0]
        fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        frun = fp.add_run("Confidential & Proprietary — GrowthSphere Africa / PetroView Technologies")
        frun.font.name = 'Segoe UI'
        frun.font.size = Pt(8.5)
        frun.font.color.rgb = COLOR_MUTED

    # Title Page
    p_title = master_doc.add_paragraph()
    p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_title.paragraph_format.space_before = Pt(72)
    run_t = p_title.add_run("PETROVIEW FORECOURT OS\n(MASTER VIEW)")
    run_t.font.name = 'Segoe UI'
    run_t.font.size = Pt(28)
    run_t.font.bold = True
    run_t.font.color.rgb = COLOR_PRIMARY

    p_sub = master_doc.add_paragraph()
    p_sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_sub.paragraph_format.space_before = Pt(12)
    run_s = p_sub.add_run("Complete Architecture, PRD, Data Dictionary, Deployment & Operations Manual")
    run_s.font.name = 'Segoe UI'
    run_s.font.size = Pt(14)
    run_s.font.color.rgb = COLOR_SECONDARY

    p_meta = master_doc.add_paragraph()
    p_meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_meta.paragraph_format.space_before = Pt(120)
    run_m = p_meta.add_run("Production Release 2.0\nPrepared for Downstream Petroleum Retail Operations\nLive Host: https://petroview.growthspheregh.com\nSeptember 2026")
    run_m.font.name = 'Segoe UI'
    run_m.font.size = Pt(10.5)
    run_m.font.color.rgb = COLOR_MUTED

    master_doc.add_page_break()

    for md_file, _, _ in files:
        md_full = os.path.join(DOCS_DIR, md_file)
        if os.path.exists(md_full):
            with open(md_full, 'r', encoding='utf-8') as f:
                content = f.read()
            parse_markdown_to_docx(content, master_doc)
            master_doc.add_page_break()

    master_doc.save(master_docx)
    print(f"Generated Master Documentation: {master_docx}")

if __name__ == '__main__':
    generate_all_docs()
