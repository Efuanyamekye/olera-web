# -*- coding: utf-8 -*-
"""Build the Consumer Relations Manager's guide to University Activation.

Shares the matrix's renderer and house style, so the guide sits with the
master and the three role manuals as one set. The only addition is figure
sizing: this document is mostly screenshots, and at the matrix's exhibit
width each one would take a page of its own.
"""
import subprocess, sys, os, json
sys.path.insert(0, os.path.abspath('.'))
import md2html

md2html.CSS += """
/* Screenshots of a dense admin UI. Sized for legibility rather than for
   page count: a walkthrough figure nobody can read is worse than a longer
   document. page-break-inside keeps a figure with its own caption. */
figure { margin: 6pt 0 10pt; page-break-inside: avoid; }
figure img { max-width: 6.1in; max-height: 5.4in; border: 0.5pt solid var(--rule); border-radius: 2pt; }
figcaption { font-size: 8.5pt; }
h1 { page-break-before: auto; }
"""

subprocess.run([sys.executable, 'dedash.py'], check=True)
md2html.build('ACTIVATION.house.md', 'activation.html',
              'University Activation',
              'A guide for the Consumer Relations Manager &#183; ST3 to ST7')
jobs = json.dumps([{'html': os.path.abspath('activation.html'),
                    'pdf': os.path.abspath('activation.pdf'),
                    'footer': 'University Activation'}])
subprocess.run(['node', 'html2pdf.mjs', jobs], check=True)
subprocess.run(['cp', 'activation.pdf', '../MedJobs_University_Activation_Guide.pdf'], check=True)
