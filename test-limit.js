import express from 'express';
import rateLimit from 'express-rate-limit';

const app = express();

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again after 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', apiLimiter);
app.use('/api/farmer', apiLimiter);

const farmerRouter = express.Router();
farmerRouter.get('/profile', (req, res) => res.json({ profile: true }));

app.use('/api/farmer', farmerRouter);

const server = app.listen(0, async () => {
  const port = server.address().port;
  console.log(`Server started on port ${port}`);
  try {
    const res = await fetch(`http://localhost:${port}/api/farmer/profile`);
    console.log('Status:', res.status);
    console.log('Body:', await res.text());
  } catch (e) {
    console.error(e);
  }
  server.close();
});
