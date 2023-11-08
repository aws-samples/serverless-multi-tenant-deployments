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


status_map = {
    "DELETE_COMPLETE": "deleted",
    "DELETE_IN_PROGRESS": "deleting",
    "UPDATE_COMPLETE": "running",
    "CREATE_COMPLETE": "running",
}


def handler(event, context):
    logger.info(f'Received event: {json.dumps(event)}')

    # Get our table to put the tenant data into
    table_tenants = os.environ.get("TABLE_TENANTS")
    table = dynamodb.Table(table_tenants)

    tenant_id = event["detail"]["stack-id"].split("/")[1].replace("tenantid-", "")
    new_status = event["detail"]["status-details"]["status"]

    if new_status not in status_map:
        return {
        "statusCode": 200,
        "body": json.dumps("Ignoring update as not mapped", cls=DecimalEncoder),
        'headers': {
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'OPTIONS,GET'
        },
    }

    ddb_record = table.get_item(
        Key={
            'tenantId': tenant_id
        }
    )

    if 'Item' in ddb_record:
        # Update the tenant status
        ddb_response = table.update_item(
            Key={
                'tenantId': tenant_id,
            },
            UpdateExpression='set #S = :s',
            ExpressionAttributeValues={
                ':s': status_map[new_status],
            },
            ExpressionAttributeNames={
                '#S': 'status'
            },
            ReturnValues='UPDATED_NEW',
        )

    logger.info(
                f'Stack update for tenant id {tenant_id}')

    return {
        "statusCode": 200,
        "body": json.dumps("Updated Stack", cls=DecimalEncoder),
        'headers': {
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'OPTIONS,GET'
        },
    }
