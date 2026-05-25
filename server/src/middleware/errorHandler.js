export function errorHandler(err, req, res, next) {
  console.error('[Error]', err.message, err.stack);

  // Handle Prisma errors
  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'Unique constraint violated' });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Record not found' });
  }

  // Handle validation errors
  if (err.name === 'ZodError') {
    return res.status(400).json({ error: err.flatten() });
  }

  // Handle authentication errors
  if (err.message === 'Invalid credentials') {
    return res.status(401).json({ error: err.message });
  }

  // Default error response
  res.status(err.statusCode || 500).json({
    error: err.message || 'Internal server error',
  });
}
