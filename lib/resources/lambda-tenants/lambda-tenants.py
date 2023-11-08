# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import logging
import json
from decimal import Decimal
import boto3
import os

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')

class DecimalEncoder(json.JSONEncoder):
  def default(self, obj):
    if isinstance(obj, Decimal):
      return str(obj)
    return json.JSONEncoder.default(self, obj)

def handler(event, context):
    logger.info(f'Received event: {json.dumps(event)}')

    # Get our table to put the tenant data into
    table_tenants = os.environ.get("TABLE_TENANTS")
    table = dynamodb.Table(table_tenants)

    response = table.scan()
    data = response['Items']

    # dynamo will paginate the after 1mb of data
    while response.get('LastEvaluatedKey'):
        response = table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
        data.extend(response['Items'])
    
    return {
        "statusCode": 200,
        "body": json.dumps(data, cls=DecimalEncoder),
        'headers': {
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'OPTIONS,GET'
        },
    }
