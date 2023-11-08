// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import {
  Stack,
  StackProps,
  RemovalPolicy,
  Stage,
  aws_s3 as s3,
  aws_s3_deployment as s3_deployment
} from "aws-cdk-lib";
import { dirname, basename } from "path";
import { Construct } from 'constructs';
import { ControlPlaneStack } from './control-plane-stack';
import { TenantStack } from "./tenant-stack";

export class ServerlessSilosStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    
    // Tenant stack template bucket
    const bucketTemplates = new s3.Bucket(this, "bucketTemplates", {
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // Create a stage to synthesize the stack
    const stage = new Stage(this, 'SynthStage');

    // Create the tenant stack as part of the dummy stage
    const tenantStack = new TenantStack(stage, 'stack', {})    

    // Force the synth
    const assembly = stage.synth()

    // Upload the synthesized template to S3
    const templateFullPath = assembly.stacks[0].templateFullPath;
    const templateFileName = basename(templateFullPath)
    
    const deployStack = new s3_deployment.BucketDeployment(this, 'DeployStack', {
      sources: [s3_deployment.Source.asset(dirname(templateFullPath))],
      destinationBucket: bucketTemplates,
    })

    const controlPlaneStack = new ControlPlaneStack(this, 'ControlPlaneStack', {
      templateBucketKey: templateFileName,
      templateBucket: bucketTemplates,
    })
    
  }
}
