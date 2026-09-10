import { Request, Response, NextFunction, RequestHandler } from 'express';

// Express 4 does not automatically forward a rejected promise from an async
// handler to the error middleware — without this, a database hiccup mid
// request just hangs the client instead of returning a clean 500. Wrap every
// async route handler in this.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
