import fs from 'fs';

const filePath = './server.js';
let content = fs.readFileSync(filePath, 'utf8');

// Function to inject string mapping for severity
const sevMapFix = `
// Inject severity mapper for frontend
const mapSeverity = (sev) => {
  if (typeof sev !== "number") return sev;
  if (sev >= 5) return "critical";
  if (sev === 4) return "high";
  if (sev === 3) return "medium";
  return "low";
};

// Map _id to id
`;

// Only run replacement if not already patched
if (!content.includes('mapSeverity(')) {
    // 1. Fix get-incidents map
    content = content.replace(
        /const data = rawData\.map\(d => \(\{\s*\.\.\.d,\s*id: d\.id \|\| \(d\._id \? d\._id\.toString\(\) : null\)\s*\}\)\);/g,
        \`\${sevMapFix}const data = rawData.map(d => ({ ...d, id: d.id || (d._id ? d._id.toString() : null), severity: mapSeverity(d.severity) }));\`
    );

    // 2. Fix /api/incident/:id res
    content = content.replace(
        /return res\.json\(incident\);/,
        \`return res.json({ ...incident.toObject(), id: incident._id, severity: mapSeverity(incident.severity) });\`
    );

    // 3. Fix /api/report-incident res
    content = content.replace(
        /severity: incident\.severity,/,
        \`severity: mapSeverity(incident.severity),\`
    );

    // 4. Fix /api/volunteer/:id/incidents
    content = content.replace(
        /return { \.\.\.doc, id: doc\.id \|\| \(doc\._id \? doc\._id\.toString\(\) : null\) };/g,
        \`return { ...doc, id: doc.id || (doc._id ? doc._id.toString() : null), severity: mapSeverity(doc.severity) };\`
    );

    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Severity integer-to-string mapping patched for all incident endpoints.');
} else {
    console.log('Already patched.');
}
