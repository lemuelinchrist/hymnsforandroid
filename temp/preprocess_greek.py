import re
import os

import re
import os

def preprocess_greek_hymns(input_path, output_path):
    with open(input_path, 'r', encoding='utf-8-sig') as f:
        content = f.read()

    # Split into raw lines but handle potential BOM/noise at the very start
    lines = content.splitlines()

    processed_hymns = []
    current_hymn = None
    
    # Regex patterns
    hymn_header_pattern = re.compile(r'^\s*(\d+|ii|i|I|l|L|[0-9]+o)\s+(.*)')
    related_pattern = re.compile(r'^\s*\((.*)\)')
    stanza_pattern = re.compile(r'^\s*(\d+)\.\s*(.*)')
    chorus_pattern = re.compile(r'^\s*(Επωδός|Επωδός\s*:|1η\s+Επωδός|2η\s+Επωδός)\s*(.*)', re.IGNORECASE)

    last_hymn_no = 0
    
    # Confirmed Hardcoded Mapping
    confirmed_mapping = {
        "GK3": "E309", "GK9": "E441", "GK10": "E789", "GK12": "NS10012",
        "GK13": "NS78", "GK14": "E509", "GK15": "E499", "GK16": "E438",
        "GK17": "E608", "GK34": "E960", "GK39": "E851", "GK40": "NS339",
        "GK41": "NS10066", "GK42": "E671", "GK43": "E30", "GK47": "E1221",
        "GK55": "E82", "GK61": "E1113", "GK68": "E312", "GK84": "E852",
        "GK87": "E1232", "GK97": "E13", "GK98": "E40", "GK101": "NS381",
        "GK102": "NS534", "GK114": "E889"
    }

    for line in lines:
        line_clean = line.strip()
        if not line_clean:
            if current_hymn and current_hymn['lyrics'] and current_hymn['lyrics'][-1] != "":
                current_hymn['lyrics'].append("")
            continue

        # Check for Hymn Number and Title
        header_match = hymn_header_pattern.match(line)
        if header_match:
            raw_no = header_match.group(1)
            # Map common OCR errors
            if raw_no in ['ii', 'iI', 'Ii', 'II']:
                hymn_no = "11"
            elif raw_no.endswith('o') and raw_no[:-1].isdigit():
                hymn_no = raw_no[:-1] + "0"
            elif raw_no in ['i', 'I', 'l', 'L'] and last_hymn_no == 0:
                hymn_no = "1"
            else:
                try:
                    hymn_no = str(int(raw_no))
                except ValueError:
                    hymn_no = str(last_hymn_no + 1)
            
            last_hymn_no = int(hymn_no)

            # If we had a previous hymn, save it
            if current_hymn:
                processed_hymns.append(current_hymn)
            
            title = header_match.group(2).strip()
            hymn_id = f'GK{hymn_no}'
            current_hymn = {
                'id': f'GK-{hymn_no}',
                'subject': title,
                'related': [],
                'parent': confirmed_mapping.get(hymn_id),
                'lyrics': []
            }
            continue

        if not current_hymn:
            continue

        # Check for Related/Parent block
        related_match = related_pattern.match(line)
        if related_match:
            related_str = related_match.group(1)
            # Map Α -> E, Κ -> C, handle non-hymn descriptions
            parts = re.split(r'[,\s/]+', related_str)
            mapped_related = []
            for p in parts:
                p = p.strip()
                if not p: continue
                
                # Check if it looks like a hymn code (Letter + Number)
                # Note: Handling both Greek and English versions of A and K
                if (p.startswith('Α-NS') or p.startswith('A-NS')) and any(char.isdigit() for char in p):
                    code = 'NS' + ''.join(filter(str.isdigit, p))
                    mapped_related.append(code)
                    if not current_hymn['parent']:
                        current_hymn['parent'] = code
                elif (p.startswith('Α-') or p.startswith('A-')) and any(char.isdigit() for char in p):
                    code = 'E' + ''.join(filter(str.isdigit, p))
                    mapped_related.append(code)
                    if not current_hymn['parent']:
                        current_hymn['parent'] = code
                elif (p.startswith('Κ-s') or p.startswith('K-s')) and any(char.isdigit() for char in p):
                    code = 'CS' + ''.join(filter(str.isdigit, p))
                    mapped_related.append(code)
                elif (p.startswith('Κ-') or p.startswith('K-')) and any(char.isdigit() for char in p):
                    code = 'C' + ''.join(filter(str.isdigit, p))
                    mapped_related.append(code)
                elif p.startswith('E') and any(char.isdigit() for char in p):
                    code = 'E' + ''.join(filter(str.isdigit, p))
                    mapped_related.append(code)
                    if not current_hymn['parent']:
                        current_hymn['parent'] = code
                elif p.startswith('NS') and any(char.isdigit() for char in p):
                    code = 'NS' + ''.join(filter(str.isdigit, p))
                    mapped_related.append(code)
                    if not current_hymn['parent']:
                        current_hymn['parent'] = code
                elif p.startswith('C') and any(char.isdigit() for char in p):
                    code = 'C' + ''.join(filter(str.isdigit, p))
                    mapped_related.append(code)
                # If it's a number only, assume English
                elif p.isdigit():
                     code = 'E' + p
                     mapped_related.append(code)
                     if not current_hymn['parent']:
                         current_hymn['parent'] = code
                else:
                    # Not a clear hymn code, keep it as is
                    mapped_related.append(p)
            
            # Clean up the related list
            clean_related = [r for r in mapped_related if any(char.isdigit() for char in r)]
            if clean_related:
                current_hymn['related'] = clean_related
                if current_hymn['parent'] and current_hymn['parent'].startswith('E') and len(current_hymn['parent']) > 4:
                     if int(''.join(filter(str.isdigit, current_hymn['parent']))) > 2000:
                          current_hymn['parent'] = current_hymn['parent'][:-1]
            else:
                current_hymn['related'] = [related_str.replace(",", " ")]
            
            continue

        # Check for Stanza
        stanza_match = stanza_pattern.match(line)
        if stanza_match:
            current_hymn['lyrics'].append(stanza_match.group(1))
            if stanza_match.group(2):
                current_hymn['lyrics'].append(stanza_match.group(2))
            continue

        # Check for Chorus
        chorus_match = chorus_pattern.match(line)
        if chorus_match:
            current_hymn['lyrics'].append("Coro:")
            if chorus_match.group(2):
                current_hymn['lyrics'].append(chorus_match.group(2))
            continue

        # Append to subject if it looks like a continuation (no lyrics or related yet)
        if not current_hymn['lyrics'] and not current_hymn['related'] and not current_hymn['parent']:
             current_hymn['subject'] += " " + line_clean
             continue

        # Otherwise, just lyric text
        current_hymn['lyrics'].append(line_clean)

    if current_hymn:
        processed_hymns.append(current_hymn)

    # Write output
    with open(output_path, 'w', encoding='utf-8') as f:
        for h in processed_hymns:
            f.write(f"{h['id']}\n")
            f.write(f"Subject: {h['subject']}\n")
            if h['related']:
                f.write(f"Related: {', '.join(h['related'])}\n")
            if h['parent']:
                f.write(f"Parent: {h['parent']}\n")
            f.write("\n")
            for l in h['lyrics']:
                f.write(f"{l}\n")
            f.write("\n**end**\n\n")

    # Write output
    with open(output_path, 'w', encoding='utf-8') as f:
        for h in processed_hymns:
            f.write(f"{h['id']}\n")
            f.write(f"Subject: {h['subject']}\n")
            if h['related']:
                f.write(f"Related: {', '.join(h['related'])}\n")
            if h['parent']:
                f.write(f"Parent: {h['parent']}\n")
            f.write("\n")
            for l in h['lyrics']:
                f.write(f"{l}\n")
            f.write("\n**end**\n\n")

if __name__ == "__main__":
    input_file = "databaseProvisioner/src/main/resources/GreekHymnal1-124.txt"
    output_file = "databaseProvisioner/src/main/resources/GreekHymnal1-124_formatted.txt"
    preprocess_greek_hymns(input_file, output_file)
    print(f"Done! Formatted file saved to {output_file}")
