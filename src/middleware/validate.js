import AppError from '../utils/AppError.js';

/**
 * Validates request parts against Zod schemas and exposes the parsed (coerced, stripped) values
 * on `req.valid`. Body/query failures become 422 with field errors; an invalid path parameter
 * means the resource cannot exist, so it becomes 404.
 */
export default function validate({ params, query, body } = {}) {
  return (req, _res, next) => {
    req.valid = {};

    if (params) {
      const result = params.safeParse(req.params);
      if (!result.success) return next(AppError.notFound());
      req.valid.params = result.data;
    }

    const details = [];
    for (const [part, schema] of [['query', query], ['body', body]]) {
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (result.success) {
        req.valid[part] = result.data;
      } else {
        details.push(...toFieldErrors(result.error, part === 'query' ? 'query.' : ''));
      }
    }

    return details.length ? next(AppError.validation(details)) : next();
  };
}

export function toFieldErrors(zodError, prefix = '') {
  return zodError.issues.map((issue) => ({
    field: prefix + formatPath(issue.path),
    message: issue.message,
  }));
}

/** ['answers', 2, 'option_id'] → 'answers[2].option_id' */
function formatPath(path) {
  let formatted = '';
  for (const segment of path) {
    if (typeof segment === 'number') formatted += `[${segment}]`;
    else formatted += formatted ? `.${segment}` : segment;
  }
  return formatted;
}
