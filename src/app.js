import pino from "pino";
import axios from 'axios';
import * as fs from "fs";
import { REFERENCE_CONTENT_TYPES, HEADERS, PAGE_SIZE, META_DATA, DATA } from "./constants.js";

//Optional headers for content management
const AUTH_TOKEN = 'authtoken';
const BRANCH = 'branch';

const logger = pino({
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
    },
  },
});

const failedEntries = [];
const cache = {};

// variable to store the rate limit (in milliseconds)
const rateLimit = 2000;

//Insert data to content using contentstack create entry api with rate limit of fix rate
export const insertBulkDataIntoContentStack = async (requests) => {
  let i = 0;
  const makeRequest = async () => {
    try {
      const response = await axios(requests[i]);
      if (response.status !== 201) {
        logger.child({ errorObj: e }).error("Create entry is failed");
        failedEntries.push(requests[i]);
        logger.info(`API ERROR : ${requests[i].data}`);
      }
      // logger.info(`API SUCCESS : ${requests[i].data}`);
      logger.info(`API SUCCESS`);
    } catch (e) {
      // logger.child({ errorObj: e }).error("Create entry is failed");
      logger.info(`Error in API ${requests[i].data} - ${e}`);
      logger.info(e.response.data)
      failedEntries.push(requests[i]);
    }
    i++;
    if (i < requests.length) {
      setTimeout(makeRequest, rateLimit);
    } else {
      logger.info("Data inserting is completed");
    }
  };
  makeRequest();
}

//Insert cuisine data to cuisine contnt type
export const publishCuisinesData = async () => {
  logger.info("Start inserting cuisines");
  // const cuisineImages = JSON.parse(fs.readFileSync('./data-jsons/images_otmm.json', 'utf8'));
  const requests = [];
  // read the data from the JSON file
  const cuisines = JSON.parse(fs.readFileSync('./data-jsons/cuisines.json', 'utf8'));
  
  for (const cuisine of cuisines) {
    // const imageObj = cuisineImages.filter(image => image.name.split('.')[0] === cuisine.value)[0];
    const payload = {
      entry: {
        // id: cuisine.WPID,
        title: cuisine.value,
        image_url: null
        // image: [{
        //   url: imageObj === undefined ? null : imageObj?.url,
        //   id: imageObj === undefined ? null : imageObj?.id,
        //   name: imageObj === undefined ? null : imageObj?.name,
        //   content_type: imageObj === undefined ? null : imageObj?.content_type,
        //   mime_type: imageObj === undefined ? null : imageObj?.meme_type
        // }],

      }
    }
    const request = {
      url: `${process.env.CREATE_ENTRY_URL}${process.env.CUISINES_CONTENT_TYPE_UID}/entries?locale=${process.env.LOCALE_CODE}`,
      method: 'post',
      headers: {
        ...HEADERS,
      },
      data: JSON.stringify(payload)
    }
    requests.push(request);
  }
  insertBulkDataIntoContentStack(requests);
}

//Insert common data to content type
export const insertCommonData = async (dataType, contentTypeUid) => {
  logger.info("Start inserting " + dataType);
  const requests = [];
  // read the data from the JSON file
  const dataTypeValues = JSON.parse(fs.readFileSync(`./data-jsons/${dataType}.json`, 'utf8'));
  for (const data of dataTypeValues) {
    const payload = {
      entry: {
        title: data.value,
        // image_url: null
      }
    }
    const request = {
      url: `${process.env.CREATE_ENTRY_URL}${contentTypeUid}/entries?locale=${process.env.LOCALE_CODE}`,
      method: 'post',
      headers: {
        ...HEADERS,
      },
      data: JSON.stringify(payload)
    }
    requests.push(request);
  }
  insertBulkDataIntoContentStack(requests);
}

// Get entry data to use as references with pagination with rate limits
export const getAllEntriesFromContentTypes = async (callback) => {
  let i = 0;
  const queryData = async () => {
    let responseData = [];
    let page = 1;
    let perPage = PAGE_SIZE;
    let totalPages = null;
    let contentType = REFERENCE_CONTENT_TYPES[i];
    try {
      while (totalPages === null || page <= totalPages) {
        let skip = ((page - 1) * perPage);
        const response = await axios({
          url: `${process.env.GET_ALL_ENTRIES_URL}${contentType.uid}/entries?include_count=true&skip=${skip}&limit=${perPage}`,
          method: 'get',
          headers: {
            ...HEADERS,
          }
        });
        if (response.status === 200) {
          responseData = [...responseData, ...response.data.entries];
          totalPages = response.data['count'] / perPage;
          page++;
        } else {
          logger.child({ errorObj: e }).error("Fetching entries is failed");
          break;
        }
      }
      cache[contentType.name] =
        responseData.map((item) => (
          {
            name: item.title,
            uid: item.uid,
            contentTypeUid: contentType.uid
          }
        ));

      i++
      if (i < REFERENCE_CONTENT_TYPES.length) {
        setTimeout(queryData, rateLimit);
      } else {
        // logger.info(cache);
        callback();
      }

    } catch (e) {
      logger.child({ errorObj: e }).error("Fetching entries is failed");
    }
  }
  queryData();
}


export const publishRecipesData = async () => {
  logger.info("Start recipe data inserting");
  const otmmImages = JSON.parse(fs.readFileSync('./recipe_prod_otmm.json', 'utf8'));
  const requests = [];
  // read the data from the JSON file
  const recipes = JSON.parse(fs.readFileSync('./recipes1.json', 'utf8'));
  for (const recipe of recipes) {
    const imageObj = otmmImages.filter(image => parseInt(image.wpid) === recipe.metadata.wpid)[0];
    const payload = {
      entry: {
        title: `${recipe?.metadata?.wpid}_${recipe?.data?.title}`,
        name: recipe?.data?.title,
        wpid: recipe?.metadata?.wpid.toString(), // only for test stack
        // wpid: recipe?.metadata?.wpid,
        special_notes: recipe?.data?.special_notes,
        // status: recipe?.metadata?.status,
        status: 'published',
        description: recipe?.data?.description,
        slogan: recipe?.data?.slogan,
        tags: recipe?.metadata?.tags.map((item) => item.value),
        categories: recipe?.metadata?.categories.map((item) => {
          let referenceCategory = cache[META_DATA.CATEGORY].find((category) => category.name === item.value);
          if (referenceCategory !== undefined) {
            return {
              uid: referenceCategory.uid,
              _content_type_uid: referenceCategory.contentTypeUid
            }
          }
        }),
        meal_types: recipe?.data?.meal_types,
        meal: recipe?.metadata?.recipe_types.map((item) => {
          let referenceMeal = cache[DATA.MEAL_TYPES].find((meal) => meal.name === item.value);
          if (referenceMeal !== undefined) {
            return {
              uid: referenceMeal.uid,
              _content_type_uid: referenceMeal.contentTypeUid
            }
          }
        }),
        main_ingredients: recipe?.metadata?.main_ingredients.map((item) => {
          let referenceMainIngredient = cache[META_DATA.MAIN_INGREDIENT].find((ingredient) => ingredient.name === item.value);
          if (referenceMainIngredient !== undefined) {
            return {
              uid: referenceMainIngredient.uid,
              _content_type_uid: referenceMainIngredient.contentTypeUid
            }
          }
        }),
        dish_types: recipe?.metadata?.dish_types.map((item) => {
          let referenceDIshTypes = cache[META_DATA.DISH_TYPES].find((dishType) => dishType.name === item.value);
          if (referenceDIshTypes !== undefined) {
            return {
              uid: referenceDIshTypes.uid,
              _content_type_uid: referenceDIshTypes.contentTypeUid
            }
          }
        }),
        dietary_needs: recipe?.metadata?.dietary_needs.map((item) => {
          let referenceDietaryNeeds = cache[META_DATA.DIETARY_NEEDS].find((dietaryItem) => dietaryItem.name === item.value);
          if (referenceDietaryNeeds !== undefined) {
            return {
              uid: referenceDietaryNeeds.uid,
              _content_type_uid: referenceDietaryNeeds.contentTypeUid
            }
          }
        }),
        techniques: recipe?.metadata?.techniques.map((item) => {
          let referenceTechnique = cache[META_DATA.TECHNIQUES].find((technique) => technique.name === item.value);
          if (referenceTechnique !== undefined) {
            return {
              uid: referenceTechnique.uid,
              _content_type_uid: referenceTechnique.contentTypeUid
            }
          }
        }),
        ingredients: recipe?.data?.ingredients,
        chef_location: recipe?.data?.chef_location,
        image: [{
          url: imageObj === undefined ? null : imageObj?.url,
          id: imageObj === undefined ? null : imageObj?.id,
          name: imageObj === undefined ? null : imageObj?.name,
          content_type: imageObj === undefined ? null : imageObj?.content_type,
          mime_type: imageObj === undefined ? null : imageObj?.meme_type
        }],
        created_gmt: recipe?.metadata?.date_gmt,
        modified_gmt: recipe?.metadata?.modified_gmt,
        link: recipe?.metadata?.link,
        // thumbnail_url: recipe?.metadata?.feature_media?.thumbnail,
        chef_name: recipe?.data?.chef_name,
        prep_time_duration: recipe?.data?.prep_time_duration,
        prep_time_unit: recipe?.data?.prep_time_unit,
        cook_time_duration: recipe?.data?.cook_time_duration,
        cook_time_unit: recipe?.data?.cook_time_unit,
        servings: recipe?.data?.servings,
        instructions: recipe?.data?.instructions,
        cuisines: recipe?.metadata?.cuisines.map((item) => {
          let referenceCuisine = cache[META_DATA.CUISINES].find((cuisine) => cuisine.name === item.value);
          if (referenceCuisine !== undefined) {
            return {
              uid: referenceCuisine.uid,
              _content_type_uid: referenceCuisine.contentTypeUid
            }
          }
        })
      }
    }
    const request = {
      url: `${process.env.CREATE_ENTRY_URL}${process.env.RECIPES_CONTENT_TYPE_UID}/entries?locale=${process.env.LOCALE_CODE}`,
      method: 'post',
      headers: {
        ...HEADERS,
      },
      data: JSON.stringify(payload)
    }
    requests.push(request);
  }
  insertBulkDataIntoContentStack(requests);
}



export const updateExistingRecipe = async () => {
  let responseData = [];
  let page = 1;
  let perPage = PAGE_SIZE;
  let totalPages = null;
  try {
    while (totalPages === null || page <= totalPages) {
      let skip = ((page - 1) * perPage);
      const response = await axios({
        url: `https://api.contentstack.io/v3/content_types/recipe_test1/entries?include_count=true&skip=${skip}&limit=${perPage}`,
        method: 'get',
        headers: {
          ...HEADERS,
        }
      });
      if (response.status === 200) {
        responseData = [...responseData, ...response.data.entries];
        totalPages = response.data['count'] / perPage;
        page++;
      } else {
        logger.child({ errorObj: e }).error("Fetching entries is failed");
        break;
      }
    }

    let count=0;
    for (const resp of responseData) {
      if (resp.cuisines.length === 0) {
        const title = resp.title;
        const uid = resp.uid;
        const payload = {
          entry: {
            title: title,
            cuisines: [
              {
                uid: "blt6b10b02e11dea68d",
                _content_type_uid: "cuisine"
              }
            ]
          }
        }
        const response = await axios({
          url: `https://api.contentstack.io/v3/content_types/recipe_test1/entries/${uid}`,
          method: 'put',
          data: JSON.stringify(payload),
          headers: {
            ...HEADERS,
          }
        });
        if (response.status === 200) {
          count++;
        }
      }

    }
    console.log(count);


  } catch (e) {
    logger.child({ errorObj: e }).error("Fetching entries is failed");
  }
}


// logger.info("Starting data inserting job");
// publishCuisinesData();
getAllEntriesFromContentTypes(publishRecipesData);

// insertCommonData('categories','category_foodie');

// updateExistingRecipe();





