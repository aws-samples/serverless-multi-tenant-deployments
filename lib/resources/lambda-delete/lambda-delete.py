# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import datetime
import logging
import json
import uuid
import boto3
import os
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
s3 = boto3.resource('s3')
cfn = boto3.client('cloudformation')


def handler(event, context):
    logger.info(f'Received event: {json.dumps(event)}')

    # Get our table to put the tenant data into
    table_tenants = os.environ.get("TABLE_TENANTS")
    table = dynamodb.Table(table_tenants)

    # Get tenant data
    body = json.loads(event["body"])
    tenant_id = body["tenantId"]

    # Get our role
    roleArn = os.environ.get("ROLE_ARN")


    # Check the record is valid and ready to be deleted
    ddb_record = table.get_item(
        Key={
        'tenantId': tenant_id
        }
    )

    logger.info(ddb_record)

    if 'Item' in ddb_record and ddb_record['Item']['status'] == "running":
        # Update the tenant status
        ddb_response = table.update_item(
            Key={
                'tenantId': tenant_id,
            },
            UpdateExpression='set #S = :s',
            ExpressionAttributeValues={
                ':s': 'deleting',
            },
            ExpressionAttributeNames={
                '#S': 'status'
            },
            ReturnValues='UPDATED_NEW',        
        )

        logger.info(
            f'Started delete of tenant infrastructure for tenant {tenant_id}')
        
        cfn.delete_stack(
            StackName=f'tenantid-{tenant_id}',
            RoleARN=roleArn,
        )

    return {
        "statusCode": 200,
        "body": json.dumps("Started deleting tenant infrastructure"),
        'headers': {
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'OPTIONS,GET'
        },
    }
