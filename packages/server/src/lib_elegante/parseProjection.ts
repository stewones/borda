import {
  Document,
  isEmpty,
  isNumber,
  Projection,
  removeUndefinedProperties,
} from '@elegante/sdk';

export function parseProjection<TSchema extends Document = Document>(
  projection: Partial<Projection<TSchema>>,
  objOrArray: TSchema | TSchema[]
): TSchema | TSchema[] {
  if (!projection) {
    return objOrArray;
  }

  if (Array.isArray(objOrArray)) {
    const filteredArray: TSchema[] = [];
    for (const obj of objOrArray) {
      const filteredObj = parseProjection(projection, obj);
      filteredArray.push(filteredObj as TSchema);
    }
    return filteredArray;
  } else {
    const filteredObj: TSchema = {} as TSchema;
    const isExclusion = isExclusionProjection(projection);
    for (const key in objOrArray) {
      if (isExclusion) {
        if (Array.isArray(objOrArray[key])) {
          const items = [];
          if (isKeyInExclusionProjection(key, projection)) {
            continue;
          } else {
            for (const item of objOrArray[key] as TSchema[]) {
              const filteredItem = parseProjection(
                projection[key as keyof TSchema] as Projection<TSchema>,
                item
              );

              items.push(filteredItem);
            }

            filteredObj[key as keyof TSchema] =
              items as unknown as TSchema[keyof TSchema];
          }
        } else {
          if (isKeyInExclusionProjection(key, projection)) {
            continue;
          } else {
            const filteredItem = parseProjection(
              projection[key as keyof TSchema] as Projection<TSchema>,
              objOrArray[key as keyof TSchema]
            );

            filteredObj[key as keyof TSchema] =
              filteredItem as TSchema[keyof TSchema];
          }
        }
      } else {
        if (key in projection) {
          if (projection[key as keyof TSchema] === 1) {
            filteredObj[key as keyof TSchema] =
              objOrArray[key as keyof TSchema];
          } else if (projection[key as keyof TSchema] === 0) {
            continue;
          } else if (typeof projection[key as keyof TSchema] === 'object') {
            const k = key as keyof TSchema;
            const v = removeUndefinedProperties(
              parseProjection(
                projection[k] as {
                  [key in keyof TSchema]: number;
                },
                objOrArray[k]
              )
            ) as TSchema[keyof TSchema];

            if (isEmpty(v)) {
              continue;
            } else {
              filteredObj[k] = v;
            }
          } else {
            filteredObj[key as keyof TSchema] =
              objOrArray[key as keyof TSchema];
          }
        }
      }
    }

    return filteredObj;
  }
}

function isExclusionProjection<TSchema extends Document = Document>(
  projection: Partial<Projection<TSchema>>
): boolean {
  // verify if the projection has only 0 values
  // in this case we need to change the logic
  // to return all the properties but the excluded ones with 0

  let isExclusionOnly = true;

  for (const key in projection) {
    const projected = projection[key as keyof TSchema];
    if (isNumber(projected) && projected !== 0) {
      isExclusionOnly = false;
      break;
    }
  }
  return isExclusionOnly;
}

function isKeyInExclusionProjection<TSchema extends Document = Document>(
  key: string,
  projection: Partial<Projection<TSchema>>
) {
  return (
    projection && key in projection && projection[key as keyof TSchema] === 0
  );
}
