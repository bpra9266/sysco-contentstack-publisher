import pino from "pino";
import axios from 'axios';
import * as fs from "fs";
import {HEADERS,PAGE_SIZE} from "../constants.js"
import path from "path";

const logger = pino({
    transport: {
        target: "pino-pretty",
        options: {
            colorize: true,
        },
    },
});
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;
const rateLimit = 2000;

const failedEntries = [];
const cache = {};

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
            logger.info(`API SUCCESS`);
        } catch (e) {
            logger.info(`Error in API ${requests[i].data} - ${e}`);
            ///logger.info(e.response.data)
            //failedEntries.push(requests[i]);
            logger.info(requests[i])
        }
        i++;
        if (i < requests.length) {
            setTimeout(makeRequest, rateLimit);
        } else {
            logger.info("Data inserting is completed");
            fs.writeFileSync('dommy.json', JSON.stringify(failedEntries),"utf-8");
        }
    };
    makeRequest();
}

export const insertCommonData = async (dataType, contentTypeUid) => {
    logger.info("Start inserting " + dataType);
    const requests = [];
    // read the data from the JSON file
    const dataTypeValues = JSON.parse(fs.readFileSync(`./data-jsons/${dataType}.json`, 'utf8'));
    for (const data of dataTypeValues) {
        const payload = {
            entry: {
                title: data,
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

export const getAllEntriesFromContentTypes = async (callback) => {
    let i = 0;
    const queryData = async () => {
        let responseData = [];
        let page = 1;
        let perPage = PAGE_SIZE;
        let totalPages = null;
        let contentType = {
            name: 'related_post',
            uid: 'related_post'
        };
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
                    totalPages = 2//response.data['count'] / perPage;
                    console.log(response.data['count'])
                    console.log(totalPages)
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
            callback();
            //console.log(cache[contentType.name])
        } catch (e) {
            console.log(e)
            logger.child({ errorObj: e }).error("Fetching entries is failed");
        }
    }
    queryData();
}
const retriveCategory = (data)=>{
    const referenceCategory = cache["category"].find((category) => category.name === data)
    if (referenceCategory !== undefined) {
        return {
            uid: referenceCategory.uid,
            _content_type_uid: referenceCategory.contentTypeUid
        }
    }
}

const retriveSlug = (imageUrl)=>{
    return path.basename(path.basename(imageUrl), path.extname(imageUrl));
}

const getImage = (wpid,imageObj,articleUrl,imageUrl)=>{
    const names = ["Weve-Got-a-Sweet-Idea-_-Desserts-Header-800x850","Weve-Got-a-Sweet-Idea-_-Desserts-2-1140x540","Weve-Got-a-Sweet-Idea-_-Desserts-1-1140x540"];
    if(imageUrl == undefined || imageUrl == null)
        return null;
    const slug = retriveSlug(articleUrl);
    const retiveImageName = retriveSlug(imageUrl);
    const extension = path.basename(imageUrl).match(/[0-9a-z]+$/i);
    let imageName = `${wpid}_${slug}_${retiveImageName}.${extension}`;
    if(wpid === "26241"){
        if(names.includes(retiveImageName)){
            imageName = `${wpid}_${retiveImageName}.${extension}`;
        }
    }
    
    const image = imageObj.filter(image=>image.name === imageName)[0];
    return [{
        url: image === undefined ? null : image?.url,
        id: image === undefined ? null : image?.id,
        name: image === undefined ? null : image?.name,
        content_type: image === undefined ? null : image?.content_type,
        mime_type: image === undefined ? null : image?.meme_type
    }]
}
const prepareArticleContent = (article,otmmImages)=>{
    const wpid = article.wpid;
    const link = article.link;
    for(let content of article.article_content){
        for(let imageData of content.images){
            if(imageData.image !== undefined && imageData.imageName !==null){
                imageData['image'] = getImage(wpid,otmmImages,link,imageData.image) ;
            }
        }

        for(let carousel of content.carousels){
            for(let crosl of carousel.carousels){
                if(crosl.image !== undefined && crosl.imageName !==null){
                    crosl['image'] =  getImage(wpid,otmmImages,link,crosl.image)
                }
            }
        }

        if(content.cta !== undefined && content.cta.image!== undefined && content.cta.image!==null){
            console.log('CTA ',content.cta.image)
            content.cta['image']= getImage(wpid,otmmImages,link,content.cta.image);
        }

        if(content.action !== undefined && content.action.image!== undefined && content.action.image!==null){
            console.log('ACTION ',content.action.image)
            content.action['image']= getImage(wpid,otmmImages,link,content.action.image);
        }
    }
    return article.article_content;
}

const prepareRelatedStory = (article,otmmImages)=>{
    const wpid = article.wpid;
    const link = article.link;
    for(let imageData of article.related_post){
        if(imageData.image !== undefined && imageData.imageName !==null){
            const img = getImage(wpid,otmmImages,link,imageData.image) ;
            imageData['image'] = img;
        }
    }
    return article.related_post;
}

export const publishArticleData = async () => {
    logger.info("Start article data inserting");
    const otmmImages = JSON.parse(fs.readFileSync('images_otmm_article.json', 'utf8'));
    
    const requests = [];
    const articles = JSON.parse(fs.readFileSync('article.json', 'utf8'));
    
    for (const article of articles) {
        const imageObj = otmmImages.filter(image => image.wpid === article.wpid);
        //console.log(imageObj)
        const payload = {
            entry: {
                title: `${article?.wpid}_${article?.name}`,
                name: article?.name,
                wpid: article?.wpid.toString(), // only for test stack
                status: 'published',
                slogan: article?.slogan,
                category: [retriveCategory(article.category)],
                sub_category: [retriveCategory(article.sub_category)],
                article_type:"newArticle",
                hero_image: getImage(article?.wpid,imageObj,article.link,article.hero_image),
                article_content: prepareArticleContent(article,imageObj),
                related_post: prepareRelatedStory(article,imageObj),
                created_gmt: dateChange(article.created_gmt),
                modified_gmt: dateChange(article.modified_gmt),
                link:article.link
            }
        }
        //fs.writeFileSync('dommy.json', JSON.stringify(payload),"utf-8");
        const request = {
            url: `${process.env.CREATE_ENTRY_URL}${process.env.ARTICLE_UID}/entries?locale=${process.env.LOCALE_CODE}`,
            method: 'post',
            headers: {
                ...HEADERS,
            },
            data: JSON.stringify(payload)
        }
        requests.push(request);
    }
    //fs.writeFileSync('dommy.json', JSON.stringify(requests),"utf-8");
    //fs.writeFile('dommy.json', JSON.stringify(data), "utf-8"
    insertBulkDataIntoContentStack(requests);
}

//getAllEntriesFromContentTypes(publishArticleData);
//publishArticleData();
//insertCommonData('article-attributes','category_foodie');

export const publishEdgeSolutionsData = async () => {
    logger.info("Start article data inserting");
    const otmmImages = JSON.parse(fs.readFileSync('images_otmm_edge.json', 'utf8'));
    
    const requests = [];
    const articles = JSON.parse(fs.readFileSync('cutting-edge.json', 'utf8'));

    for (const article of articles) {
        const imageObj = otmmImages.filter(image => image.wpid === article.wpid || image.wpid === 'feature');
        //console.log(imageObj)
        const payload = {
            entry: {
                title: `${article?.wpid}_${article?.page_header?.title}`,
                wpid: article?.wpid.toString(), // only for test stack
                status: 'published',
                category: [retriveCategory(article.category)],
                article_type:"bannerArticle",
                page_header: preparePageHeader(article,imageObj),
                content : article.content,
                section_header: article.section_header,
                recipes: prepareRecipes(article,imageObj),
                feature_products: prepareFeatureProducts(article.feature_products,imageObj),
                created_gmt: dateChange(article.created_gmt),
                modified_gmt: dateChange(article.modified_gmt),
                link:article.link
            }
        }
        //fs.writeFileSync('dommy.json', JSON.stringify(payload),"utf-8");
        const request = {
            url: `${process.env.CREATE_ENTRY_URL}${process.env.CUTTING_EDGE_COLUTION}/entries?locale=${process.env.LOCALE_CODE}`,
            method: 'post',
            headers: {
                ...HEADERS,
            },
            data: JSON.stringify(payload)
        }
        requests.push(request);
    }
    //fs.writeFileSync('dommy.json', JSON.stringify(requests),"utf-8");
    //fs.writeFile('dommy.json', JSON.stringify(data), "utf-8"
    insertBulkDataIntoContentStack(requests);
}
const dateChange =(data)=>{
    var i = data.lastIndexOf(":")
    return data.substr(0,i)+'+00'+data.substr(i);
}
const preparePageHeader = (article,imageObj)=>{
    article.page_header['image'] =getImage(article.wpid,imageObj,article.link,article.page_header.image);
    return article.page_header;
}

const prepareRecipes = (article,imageObj)=>{
    for(let card of article.recipes.card){
        card['image'] = getImage(article.wpid,imageObj,article.link,card.image);
    }
    return article.recipes;
}
const START = 'https://image.sysco.com/image-server/product/image/';
const END = '/web';
const prepareFeatureProducts = (products,imageObj)=>{
    for(let product of products){
        const name = product.image.substring(START.length,product.image.indexOf(END));
        const extension = path.basename(product.image).match(/[0-9a-z]+$/i);
        product['image'] = getFeatureImage(`feature_product_image_${name}.${extension}`,imageObj);
    }
    return products;
}

const getFeatureImage = (name,imageObj)=>{
    const image = imageObj.filter(image=>image.name === name)[0];
    return [{
        url: image === undefined ? null : image?.url,
        id: image === undefined ? null : image?.id,
        name: image === undefined ? null : image?.name,
        content_type: image === undefined ? null : image?.content_type,
        mime_type: image === undefined ? null : image?.meme_type
    }]
}
// const images = JSON.parse(fs.readFileSync('cutting-edge.json', 'utf8'));
// console.log(images.length)
// const otmmImages = JSON.parse(fs.readFileSync('images_otmm_edge.json', 'utf8'));
// const imageObj = otmmImages.filter(image => image.wpid === '32817' || image.wpid === 'feature');
// console.log(imageObj);
// console.log(imageObj.length);

//getAllEntriesFromContentTypes(publishEdgeSolutionsData);

export const publishEdgeSolutionsHomePageData = async () => {
    logger.info("Start article data inserting");
    const otmmImages = JSON.parse(fs.readFileSync('images_otmm_edge.json', 'utf8'));

    const requests = [];
    const article = JSON.parse(fs.readFileSync('cutting_edge_home.json', 'utf8'));

    const imageObj = otmmImages.filter(image => image.wpid === article.wpid || image.wpid === 'feature');
    //console.log(imageObj)
    const payload = {
        entry: {
            title: `${article?.wpid}_CUTTING_EDGE_HOME_PAGE`,
            wpid: article?.wpid.toString(), // only for test stack
            status: 'published',
            category: [retriveCategory(article.category)],
            article_type:"bannerArticleHome",
            header_image: {
                small_image: getImage(article.wpid, imageObj, article.link, article.header_image.small_image),
                large_image: getImage(article.wpid, imageObj, article.link, article.header_image.large_image)
            },
            header_text: article.header_text,
            bill_board: prepareBillBoard(article, imageObj),
            edge_solutions: prepareEdgeSolutions(article, imageObj),
            content_body: prepareContentBody(article, imageObj),
            products: prepareFeatureProducts(article.products.related_products, imageObj),
            related_recipies: prepareEdgeRecipes(article, imageObj),
            created_gmt: article.created_gmt,
            modified_gmt: article.modified_gmt,
            page_link: article.link_page,
            link: article.link
        }
    }
    //fs.writeFileSync('dommy.json', JSON.stringify(payload),"utf-8");
    const request = {
        url: `${process.env.CREATE_ENTRY_URL}${process.env.CUTTING_EDGE_HOME_PAGE_UID}/entries?locale=${process.env.LOCALE_CODE}`,
        method: 'post',
        headers: {
            ...HEADERS,
        },
        data: JSON.stringify(payload)
    }
    requests.push(request);
    //fs.writeFileSync('dommy.json', JSON.stringify(requests),"utf-8");
    //fs.writeFile('dommy.json', JSON.stringify(data), "utf-8"
    insertBulkDataIntoContentStack(requests);
}

const prepareBillBoard = (article,imageObj)=>{
    for(let card of article.bill_board.cards){
        card['image'] = getImage(article.wpid,imageObj,article.link,card.image);
    }
    return article.bill_board;
}

const prepareEdgeSolutions = (article,imageObj)=>{
    for(let edge_solution of article.edge_solutions.carousel){
        edge_solution['image'] = getImage(article.wpid,imageObj,article.link,edge_solution.image);
    }
    return article.edge_solutions;
}

const prepareContentBody = (article,imageObj)=>{
    article.content_body['image'] = getImage(article.wpid,imageObj,article.link,article.content_body.image);
    return article.content_body;
}

const prepareEdgeRecipes = (article,imageObj)=>{
    for(let resipie of article.related_recipies.resipies){
        resipie['image'] = getImage(article.wpid,imageObj,article.link,resipie.image);
    }
    return article.related_recipies;
}

export const updateRelatedPostEntry = async () => {
    logger.info("Start article data inserting");
    const requests = [];
    const articles = JSON.parse(fs.readFileSync('related_post.json', 'utf8'));
    //const otmmImages = JSON.parse(fs.readFileSync('images_otmm_article.json', 'utf8'));
    for (const article of articles) {
        //const imageObj = otmmImages.filter(image => image.wpid === article.wpid);
        const payload = {
            entry: {
                related_posts: article?.related_post.filter((data)=>data.uid.length>0).map((item) => {
                    let referenceDietaryNeeds = cache["related_post"].find((dietaryItem) => dietaryItem.name === item.title);
                    console.log(referenceDietaryNeeds)
                    if (referenceDietaryNeeds !== undefined) {
                      return {
                        uid: referenceDietaryNeeds.uid,
                        _content_type_uid: referenceDietaryNeeds.contentTypeUid
                      }
                    }
                  })
            }
        }
        //console.log(payload)
        //fs.writeFileSync('dommy.json', JSON.stringify(payload),"utf-8");//bltd7886249a3eeeaf8  bltd7886249a3eeeaf8//real
        const request = {
            url: `${process.env.CREATE_ENTRY_URL}${process.env.ARTICLE_DEMO_UID}/entries/${article.uid}`,
            method: 'put',
            headers: {
                ...HEADERS,
            },
            data: JSON.stringify(payload)
        }
        requests.push(request);
    }
    //fs.writeFileSync('dommy.json', JSON.stringify(requests),"utf-8");
    //fs.writeFile('dommy.json', JSON.stringify(data), "utf-8"
    insertBulkDataIntoContentStack(requests);
}
export const uploadRelatedData = async () => {
    logger.info("Start article data inserting");
    const requests = [];
    const articles = JSON.parse(fs.readFileSync('related_post.json', 'utf8'));
    let count =0;
    for (const article of articles) {
        // if(count ==1)
        //      break;
        //  count=1+count;
        for (const post of article.related_post) {
            if(post.uid.length>0){
                const payload = {
                    entry: {
                        href: post.href,
                        title: post.title,
                        image: post.image,
                        category:post.category,
                        article_id: post.uid[0],
                        article_type:"newArticle",
                    }
                }
                //console.log(payload)
                const request = {
                    url: `${process.env.CREATE_ENTRY_URL}${process.env.ARTICLE_RELATED_POST_UID}/entries?locale=${process.env.LOCALE_CODE}`,
                    method: 'post',
                    headers: {
                        ...HEADERS,
                    },
                    data: JSON.stringify(payload)
                }
                requests.push(request);
            }
        }
    }
    //console.log(JSON.stringify(requests))
    insertBulkDataIntoContentStack(requests);
}
uploadRelatedData();
//getAllEntriesFromContentTypes(updateEntry);
//getAllEntriesFromContentTypes(publishArticleData);
//getAllEntriesFromContentTypes(publishEdgeSolutionsData);
//getAllEntriesFromContentTypes(publishEdgeSolutionsHomePageData);