#!/bin/sh
# Build the house-style Consumer Relations Manager guide to the
# University Activation workspace. Same pipeline as the matrix and the
# three role manuals, so the four documents look like one set.
set -e
python3 dedash.py
python3 md2html.py ACTIVATION.house.md activation.html \
  "University Activation" \
  "A guide for the Consumer Relations Manager &#183; ST3 to ST7"
node html2pdf.mjs "$(python3 -c "import json,os;print(json.dumps([{
  'html': os.path.abspath('activation.html'),
  'pdf':  os.path.abspath('activation.pdf'),
  'footer':'University Activation'}]))")"
cp activation.pdf ../MedJobs_University_Activation_Guide.pdf
