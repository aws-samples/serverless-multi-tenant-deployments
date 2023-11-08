# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import logging
import json
import boto3
import os

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
s3 = boto3.resource('s3')
cfn = boto3.client('cloudformation')

wanted_resources = ["AWS::DynamoDB::Table"]

def handler(event, context):
    logger.info(f'Received event: {json.dumps(event)}')

    # Get our table to put the tenant data into
    table_tenants = os.environ.get("TABLE_TENANTS")
    table = dynamodb.Table(table_tenants)

    # Get tenant data
    body = json.loads(event["body"])
    tenant_id = body["tenantId"]

    # Check the record is valid and ready to be deleted
    ddb_record = table.get_item(
        Key={
        'tenantId': tenant_id
        }
    )

    logger.info(ddb_record)

    stack_resources = ""
    resource_details = []

    if 'Item' in ddb_record and ddb_record['Item']['status'] == "running":
        logger.info(
            f'Getting stack resources {tenant_id}')
        
        stack_resources = cfn.list_stack_resources(
            StackName=f'tenantid-{tenant_id}',
        )

        logger.info(f'Resources: {stack_resources}')

        for resource in stack_resources['StackResourceSummaries']:
            # if resource['ResourceType'] in wanted_resources:
            resource_details.append(resource)

    return {
        "statusCode": 200,
        "body": json.dumps(resource_details, default=str),
        'headers': {
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'OPTIONS,GET'
        },
    }
