import fs from 'fs';

const filePath = './server.js';
let content = fs.readFileSync(filePath, 'utf8');

// I need to add bcryptjs, jsonwebtoken, and User model imports.
if(!content.includes('import User from "./models/User.js"')) {
    content = content.replace(
        'import Volunteer from "./models/Volunteer.js";',
        'import Volunteer from "./models/Volunteer.js";\nimport User from "./models/User.js";\nimport bcrypt from "bcryptjs";\nimport jwt from "jsonwebtoken";'
    );
}

const authBlockReplacement = `// --- AUTH REGISTER ---
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, phone, role } = req.body;
    if (!name || !email || !password || !phone) return res.status(400).json({ error: "All fields are required" });

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: "Email already registered" });

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const user = new User({
      name,
      email,
      phone,
      password_hash,
      role: role && role === "volunteer" ? "volunteer" : "user",
    });
    await user.save();

    // If volunteer, auto-create a Volunteer profile so they appear in roster/map
    if (user.role === "volunteer") {
      const vol = new Volunteer({
        full_name: name,
        phone,
        status: "available",
        role: "volunteer",
        user_id: user._id.toString(),
      });
      await vol.save();
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET || "civrescue_fallback_secret",
      { expiresIn: "7d" }
    );

    return res.json({ token, role: user.role, userId: user._id, name: user.name });
  } catch (err) {
    console.error("[Register] Error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// --- AUTH LOGIN ---
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    // 1. Maintain Demo Hook for presentation ease
    const demoAccounts = [
      { email: "admin@civrescue.in", password: "admin123", role: "admin", name: "Command Admin" },
      { email: "volunteer@civrescue.in", password: "vol123", role: "volunteer", name: "Field Volunteer" },
      { email: "user@civrescue.in", password: "user123", role: "user", name: "Citizen User" },
    ];
    const match = demoAccounts.find(a => a.email === email && a.password === password);

    if (match) {
      let userId = match.email;
      if (match.role === "volunteer") {
        let vol = await Volunteer.findOne({ user_id: "demo-volunteer" });
        if (!vol) {
          vol = new Volunteer({
            full_name: "Field Volunteer",
            phone: "+91 99999 00001",
            availability: "available",
            role: "volunteer",
            user_id: "demo-volunteer",
          });
          await vol.save();
        }
        userId = vol._id.toString();
      }
      return res.json({
        token: match.role + "-" + Date.now(),
        role: match.role,
        userId,
        name: match.name,
      });
    }

    // 2. Real JWT Auth checking MongoDB
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET || "civrescue_fallback_secret",
      { expiresIn: "7d" }
    );

    return res.json({
      token,
      role: user.role,
      userId: user._id,
      name: user.name,
    });
  } catch (err) {
    console.error("[Auth Login] Error:", err);
    return res.status(500).json({ error: err.message });
  }
});`;

// find the existing login block and replace it
const startIndex = content.indexOf('// --- AUTH LOGIN ---');
const endIndex = content.indexOf('// --- VOLUNTEER STATUS TOGGLE');
if (startIndex !== -1 && endIndex !== -1) {
    content = content.slice(0, startIndex) + authBlockReplacement + '\n\n' + content.slice(endIndex);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Auth backend endpoints patched.');
