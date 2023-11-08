# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import logging
import json
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

    # Get our template from the bucket and role
    bucket_template = os.environ.get("BUCKET_TEMPLATE")
    key_template = os.environ.get("KEY_TEMPLATE")
    roleArn = os.environ.get("ROLE_ARN")

    content_object = s3.Object(bucket_template, key_template)
    file_content = content_object.get()['Body'].read().decode('utf-8')

    # Get tenant data
    records = event["Records"]

    # Iterate across all tenant creation records
    for record in records:
        tenant_data = {k: (v["S"] if "S" in v else v["N"] ) for k,v in record["dynamodb"]["NewImage"].items()}

        # Check the record is valid and ready to provision
        ddb_record = table.get_item(
            Key={
            'tenantId': tenant_data['tenantId']
            }
        )

        logger.info(ddb_record)

        if 'Item' in ddb_record and ddb_record['Item']['status'] == "initiated":
            # Update the tenant status
            ddb_response = table.update_item(
                Key={
                    'tenantId': tenant_data["tenantId"],
                },
                UpdateExpression='set #S = :s',
                ExpressionAttributeValues={
                    ':s': 'provisioning',
                },
                ExpressionAttributeNames={
                    '#S': 'status'
                },
                ReturnValues='UPDATED_NEW',        
            )

            logger.info(
                f'Started provisioning tenant infrastructure for tenant {tenant_data["tenantId"]}')
            
            params = [
                {"ParameterKey": "ParamTenantId", "ParameterValue": tenant_data["tenantId"]},
                {"ParameterKey": "ParamTenantName", "ParameterValue": tenant_data["tenantName"]}
            ]
            
            cfn.create_stack(
                StackName=f'tenantid-{tenant_data["tenantId"]}',
                TemplateBody=file_content,
                Parameters=params,
                Capabilities=['CAPABILITY_IAM'],
                RoleARN=roleArn,
            )

    return {
        "statusCode": 200,
        "body": json.dumps("Started provisioning tenant infrastructure"),
        'headers': {
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'OPTIONS,GET'
        },
    }
