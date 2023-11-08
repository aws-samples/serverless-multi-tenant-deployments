// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import {
  Stack,
  StackProps,
  RemovalPolicy,
  Duration,
  aws_s3 as s3,
  aws_iam as iam,
  aws_dynamodb as ddb,
  aws_lambda as lambda,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as cloudfront_origins,
  aws_s3_deployment as s3_deployment,
  aws_stepfunctions as sfn,
  aws_stepfunctions_tasks as tasks,
  aws_cloudformation as cloudformation,
  aws_events as events,
  aws_events_targets as targets,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as apigwv2 from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

interface ControlPlaneStackProps extends StackProps {
  templateBucketKey: string;
  templateBucket: s3.Bucket;
}

export class ControlPlaneStack extends Stack {
  constructor(scope: Construct, id: string, props: ControlPlaneStackProps) {
    super(scope, id, props);

    //------------------------------------------------------------------------------------//
    // Datastores                                                                         //
    //------------------------------------------------------------------------------------//

    // Tenants table for storing our signed up customers
    const tableTenants = new ddb.Table(this, "TableTenants", {
      partitionKey: {
        name: "tenantId",
        type: ddb.AttributeType.STRING,
      },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
      stream: ddb.StreamViewType.NEW_IMAGE,
    });

    // Adding a secondary index to allow query on name
    tableTenants.addGlobalSecondaryIndex({
      indexName: "tenantNameIndex",
      partitionKey: {
        name: "tenantName",
        type: ddb.AttributeType.STRING,
      },
    });

    //------------------------------------------------------------------------------------//
    // API                                                                                //
    //------------------------------------------------------------------------------------//

    // API for new customers signups
    const api = new apigwv2.HttpApi(this, "HttpProxyApi", {
      corsPreflight: {
        allowHeaders: ["Authorization", "Content-Type"],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.HEAD,
          apigwv2.CorsHttpMethod.OPTIONS,
          apigwv2.CorsHttpMethod.POST,
        ],
        allowOrigins: ["*"],
        maxAge: Duration.days(10),
      },
    });

    //------------------------------------------------------------------------------------//
    // Lambda - Get Tenants                                                               //
    //------------------------------------------------------------------------------------//

    // Lambda function to update our tenants table
    const lambdaTenants = new lambda.Function(this, "LambdaTenants", {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset("./lib/resources/lambda-tenants"),
      handler: "lambda-tenants.handler",
      environment: {
        TABLE_TENANTS: tableTenants.tableName,
      },
    });

    // Provide the lambda access to modify the table
    tableTenants.grantFullAccess(lambdaTenants);

    // API Gateway V2 setup
    const integrationTenants = new HttpLambdaIntegration(
      "IntegrationTenants",
      lambdaTenants
    );

    api.addRoutes({
      path: "/tenants",
      methods: [apigwv2.HttpMethod.GET],
      integration: integrationTenants,
    });

    //------------------------------------------------------------------------------------//
    // Lambda - Create Tenant                                                             //
    //------------------------------------------------------------------------------------//

    // Lambda function to update our tenants table
    const lambdaOnboarding = new lambda.Function(this, "LambdaOnboarding", {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset("./lib/resources/lambda-onboarding"),
      handler: "lambda-onboarding.handler",
      environment: {
        TABLE_TENANTS: tableTenants.tableName,
      },
    });

    // Provide the lambda access to modify the table
    tableTenants.grantFullAccess(lambdaOnboarding);

    // API Gateway V2 setup
    const integrationOnboarding = new HttpLambdaIntegration(
      "IntegrationOnboarding",
      lambdaOnboarding
    );

    api.addRoutes({
      path: "/onboarding",
      methods: [apigwv2.HttpMethod.POST],
      integration: integrationOnboarding,
    });    

    //------------------------------------------------------------------------------------//
    // Provisioning Event                                                                 //
    //------------------------------------------------------------------------------------//

    // Provisioning role for cloudformation
    const roleStackProvisioning = new iam.Role(this, "RoleStackProvisioning", {
      assumedBy: new iam.ServicePrincipal("cloudformation.amazonaws.com"),
      description: "Role for deploying tenant stacks through cloudformation",
    });

    // Scope the below permissions appropriately
    const policyStatementProvisioning = new iam.PolicyStatement({
      actions: ["cloudformation:*", "dynamodb:*", "lambda:*", "ssm:GetParameters", "iam:*", "s3:*"],
      resources: ["*"],
    });
    roleStackProvisioning.addToPolicy(policyStatementProvisioning);

    // Lambda function to handle provisioning tenant infrastructure
    const lambdaProvisioning = new lambda.Function(this, "LambdaProvisioning", {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset("./lib/resources/lambda-provisioning"),
      handler: "lambda-provisioning.handler",
      environment: {
        TABLE_TENANTS: tableTenants.tableName,
        BUCKET_TEMPLATE: props.templateBucket.bucketName,
        KEY_TEMPLATE: props.templateBucketKey,
        ROLE_ARN: roleStackProvisioning.roleArn,
      },
    });

    // Allow the lambda to initiate stack creation
    lambdaProvisioning.addToRolePolicy(
      new iam.PolicyStatement({
        resources: ["*"], // Scope the resources appropriately
        actions: ["cloudformation:CreateStack"],
      })
    );

    // Provide the lambda access to the table
    tableTenants.grantFullAccess(lambdaProvisioning);
    tableTenants.grantStreamRead(lambdaProvisioning);
    // Grant access to read templates from the bucket
    props.templateBucket.grantRead(lambdaProvisioning);
    // Allow the provisioning lambda to pass the role to cloudformation
    roleStackProvisioning.grantPassRole(lambdaProvisioning.grantPrincipal);

    // Associate the lambda to INSERT events on the tenants table
    // This allows updates (MODIFY) to the records without triggering provisioning again
    const eventSource = new lambda.EventSourceMapping(
      this,
      "EventSourceMappingLambda",
      {
        target: lambdaProvisioning,
        eventSourceArn: tableTenants.tableStreamArn,
        startingPosition: lambda.StartingPosition.LATEST,
      }
    );

    // Escape hatch to get an L1 ref
    const cfnSource = eventSource.node
      .defaultChild as lambda.CfnEventSourceMapping;

    cfnSource.addPropertyOverride("FilterCriteria", {
      Filters: [
        {
          Pattern: `{ \"eventName\": [\"INSERT\"] }`,
        },
      ],
    });

    //------------------------------------------------------------------------------------//
    // Lambda - Delete Tenant                                                             //
    //------------------------------------------------------------------------------------//

    // Delete role for cloudformation
    const roleStackDelete = new iam.Role(this, "RoleStackDelete", {
      assumedBy: new iam.ServicePrincipal("cloudformation.amazonaws.com"),
      description: "Role for deploying tenant stacks through cloudformation",
    });

    // Scope the below permissions appropriately
    const policyStatementDelete = new iam.PolicyStatement({
      actions: ["cloudformation:*", "dynamodb:*", "lambda:*", "iam:*"],
      resources: ["*"],
    });
    roleStackDelete.addToPolicy(policyStatementDelete);

    // Lambda function to update our tenants table
    const lambdaDelete = new lambda.Function(this, "LambdaDelete", {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset("./lib/resources/lambda-delete"),
      handler: "lambda-delete.handler",
      environment: {
        TABLE_TENANTS: tableTenants.tableName,
        ROLE_ARN: roleStackDelete.roleArn,
      },
    });

    // Allow the lambda to initiate stack deletion
    lambdaDelete.addToRolePolicy(
      new iam.PolicyStatement({
        resources: ["*"], // Scope the resources appropriately
        actions: ["cloudformation:DeleteStack"],
      })
    );

    // Provide the lambda access to modify the table
    tableTenants.grantFullAccess(lambdaDelete);

    // API Gateway V2 setup
    const integrationDelete = new HttpLambdaIntegration(
      "IntegrationDelete",
      lambdaDelete
    );

    api.addRoutes({
      path: "/delete",
      methods: [apigwv2.HttpMethod.POST],
      integration: integrationDelete,
    });

    // Allow the provisioning lambda to pass the role to cloudformation
    roleStackDelete.grantPassRole(lambdaDelete.grantPrincipal);


    //------------------------------------------------------------------------------------//
    // Lambda - Stack Updates                                                             //
    //------------------------------------------------------------------------------------//

    // Lambda function to update our tenants table
    const lambdaStackUpdate = new lambda.Function(this, "LambdaStackUpdate", {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset("./lib/resources/lambda-stack-update"),
      handler: "lambda-stack-update.handler",
      environment: {
        TABLE_TENANTS: tableTenants.tableName,
      },
    });

    // Provide the lambda access to modify the table
    tableTenants.grantFullAccess(lambdaStackUpdate);

    const ruleStackUpdate = new events.Rule(this, "RuleStackUpdate", {
      eventPattern: {        
        source: ["aws.cloudformation"],
        detailType: ["CloudFormation Stack Status Change"],        
      }
    })

    ruleStackUpdate.addTarget(new targets.LambdaFunction(lambdaStackUpdate))


    //------------------------------------------------------------------------------------//
    // Lambda - Get Tenant Info                                                           //
    //------------------------------------------------------------------------------------//

    // Lambda function to update our tenants table
    const lambdaTenantInfo = new lambda.Function(this, "LambdaTenantInfo", {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset("./lib/resources/lambda-tenant-info"),
      handler: "lambda-tenant-info.handler",
      environment: {
        TABLE_TENANTS: tableTenants.tableName,
      },
    });

    // Provide the lambda access to modify the table
    tableTenants.grantFullAccess(lambdaTenantInfo);

    lambdaTenantInfo.addToRolePolicy(
      new iam.PolicyStatement({
        resources: ["*"], // Scope the resources appropriately
        actions: ["cloudformation:ListStackResources"],
      })
    );

    // API Gateway V2 setup
    const integrationTenantInfo = new HttpLambdaIntegration(
      "IntegrationTenantInfo",
      lambdaTenantInfo
    );

    api.addRoutes({
      path: "/tenant-info",
      methods: [apigwv2.HttpMethod.POST],
      integration: integrationTenantInfo,
    });

  }
}
