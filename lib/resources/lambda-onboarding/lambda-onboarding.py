# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import datetime
import logging
from decimal import Decimal
import json
import uuid
import boto3
import os
from boto3.dynamodb.conditions import Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')

def handler(event, context):
    logger.info(f'Received event: {json.dumps(event)}')

    # Get tenant data
    body = json.loads(event["body"])
    tenant_name = body["tenantName"]
    tenant_safe_name = tenant_name.lower().replace(" ", "")
    deployment_type = body["deploymentType"]
    
    # Generate our tenant UUID
    tenant_id = str(uuid.uuid4())
    created = datetime.datetime.now().timestamp()

    # Get our table to put the tenant data into
    table_tenants = os.environ.get("TABLE_TENANTS")
    table = dynamodb.Table(table_tenants)

    # Check if this tenant has already been registered
    query = table.query(
        IndexName = 'tenantNameIndex',
        KeyConditionExpression=Key('tenantName').eq(tenant_name)
    )

    if 'Items' in query and len(query['Items']) > 0:
        logger.info(f'Customer {tenant_name} already exists!')

        return {
            "statusCode": 403,
            "body": json.dumps("Customer already exists!"),
            'headers': {
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'OPTIONS,GET'
            },
        }

    # Add our new tenant
    response = table.put_item(
        Item={
            'tenantId': tenant_id,
            'tenantName': tenant_name,
            'tenantSafeName': tenant_safe_name,
            'deploymentType': deployment_type,
            'status': "initiated",
            'created': Decimal(created),
        }
    )

    logger.info(f'Customer {tenant_name} created!')

    return {
        "statusCode": 200,
        "body": json.dumps("Customer successfully created, please wait for provisioning"),
        'headers': {
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'OPTIONS,GET'
        },
    }
