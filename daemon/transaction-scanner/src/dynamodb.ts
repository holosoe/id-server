import AWS from 'aws-sdk';
import { PhoneSessions } from './types.js';
AWS.config.update({
  region:'us-east-2',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID_FOR_DYNAMODB,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_FOR_DYNAMODB
});
const dynamoDB = new AWS.DynamoDB.DocumentClient();

export async function getAllPhoneSessions() {
  const params = {
    TableName: 'phone-sessions',
    ExclusiveStartKey: null as null | any
  };

  let items: PhoneSessions = [];
  let lastEvaluatedKey = null;

  let i = 0;
  do {
    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }

    const result = await dynamoDB.scan(params).promise();
    items = items.concat(result.Items as PhoneSessions);
    lastEvaluatedKey = result.LastEvaluatedKey;
    i++;
  } while (lastEvaluatedKey);

  return items;
}
