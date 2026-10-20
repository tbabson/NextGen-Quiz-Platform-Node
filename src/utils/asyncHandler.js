/** Express 4 does not forward rejected promises to the error handler; this wrapper does. */
export default function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
