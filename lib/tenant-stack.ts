// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import {
    Stack,
    StackProps,
    CfnParameter,
    RemovalPolicy,
    aws_lambda as lambda,
    aws_dynamodb as ddb,
  } from "aws-cdk-lib";
import { Construct } from 'constructs';

export class TenantStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    //------------------------------------------------------------------------------------//
    // Parameters                                                                         //
    //------------------------------------------------------------------------------------//

    const paramTenantId = new CfnParameter(this, "ParamTenantId", {
        type: "String",
        description: "The tenant ID this stack is being created for"});

    const paramTenantName = new CfnParameter(this, "ParamTenantName", {
        type: "String",
        description: "The name of the tenant this stack is being created for"});

    //------------------------------------------------------------------------------------//
    // Resources                                                                          //
    //------------------------------------------------------------------------------------//

    // Tenants table for storing our signed up customers
    const tableTenantsSilo = new ddb.Table(this, "TableTenantSilo", {
        partitionKey: {
          name: "itemId",
          type: ddb.AttributeType.STRING,
        },
        billingMode: ddb.BillingMode.PAY_PER_REQUEST,
        removalPolicy: RemovalPolicy.DESTROY,
        stream: ddb.StreamViewType.NEW_IMAGE,
      })

    // Lambda function to handle provisioning tenant infrastructure
    const lambdaTenantSilo = new lambda.Function(this, "LambdaTenantSilo", {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset("./lib/resources/lambda-provisioning"),
      handler: "lambda-provisioning.handler",
      environment: {
        TABLE_TENANTS: tableTenantsSilo.tableName,
        TENANT_ID: paramTenantId.valueAsString,
        TENANT_NAME: paramTenantName.valueAsString,
      },
    });

    // Provide the lambda access to the table
    tableTenantsSilo.grantFullAccess(lambdaTenantSilo);

    
  }
}
